import { createHash } from "node:crypto";

import {
  DEFAULT_MAX_RESPONSE_BYTES,
  EXPECTED_RESOLVED_MODEL,
  JUDGMENT_CONTRACT_VERSION,
  QUESTION_SET_VERSION,
  REQUESTED_JEV_MODEL,
  type JevEvaluationOptions,
  type JevProvider,
  type JudgmentAttemptReceipt,
  type JudgmentErrorCode,
  type JudgmentEvaluation,
  type JudgmentRequest,
} from "../contracts";
import { JudgmentProviderError } from "../errors";
import { validateJudgmentRequest } from "../request";
import { parseAndValidateDecisionsResponse } from "../validation";

const DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const RETRYABLE_STATUSES = new Set([
  408, 429, 500, 502, 503, 504, 520, 521, 522, 524, 529,
]);

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface OpenRouterJevProviderOptions {
  readonly apiKey: string;
  readonly requestedModel?: string;
  readonly expectedResolvedModel?: string;
  readonly fetcher?: Fetcher;
  readonly sleeper?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly timeoutMs?: number;
  readonly runDeadlineMs?: number;
  readonly maxAttempts?: number;
  readonly maxResponseBytes?: number;
}

function codeForStatus(status: number): JudgmentErrorCode {
  if (status === 400 || status === 404 || status === 422)
    return "INVALID_REQUEST";
  if (status === 401 || status === 403) return "AUTHENTICATION";
  if (status === 402) return "INSUFFICIENT_CREDITS";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  return "PROVIDER_UNAVAILABLE";
}

function parseRetryAfter(
  value: string | null,
  now: number,
): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1000, 5000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.min(Math.max(date - now, 0), 5000);
  return undefined;
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<{ readonly responseHash: string; readonly text: string }> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel();
    throw new JudgmentProviderError("INVALID_RESPONSE", false);
  }
  const hasher = createHash("sha256");
  if (response.body === null) {
    return { responseHash: hasher.digest("hex"), text: "" };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new JudgmentProviderError("INVALID_RESPONSE", false);
      }
      hasher.update(value);
      text += decoder.decode(value, { stream: true });
    }
    return {
      responseHash: hasher.digest("hex"),
      text: text + decoder.decode(),
    };
  } finally {
    reader.releaseLock();
  }
}

export class OpenRouterJevProvider implements JevProvider {
  readonly id = "openrouter";
  readonly #apiKey: string;
  readonly #requestedModel: string;
  readonly #expectedResolvedModel?: string;
  readonly #fetcher: Fetcher;
  readonly #sleeper: (milliseconds: number) => Promise<void>;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #timeoutMs: number;
  readonly #runDeadlineMs: number;
  readonly #maxAttempts: number;
  readonly #maxResponseBytes: number;

  constructor(options: OpenRouterJevProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#requestedModel = options.requestedModel ?? REQUESTED_JEV_MODEL;
    this.#expectedResolvedModel =
      options.expectedResolvedModel ??
      (this.#requestedModel === REQUESTED_JEV_MODEL
        ? EXPECTED_RESOLVED_MODEL
        : undefined);
    this.#fetcher = options.fetcher ?? fetch;
    this.#sleeper =
      options.sleeper ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
    this.#timeoutMs = options.timeoutMs ?? 20_000;
    this.#runDeadlineMs = options.runDeadlineMs ?? 50_000;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  }

  async evaluate(
    request: JudgmentRequest,
    options: JevEvaluationOptions = {},
  ): Promise<JudgmentEvaluation> {
    const callerSignal = options.signal;
    if (callerSignal?.aborted) {
      throw new JudgmentProviderError("CANCELED", false);
    }
    validateJudgmentRequest(request);
    this.#validateConfiguration(request);
    const startedAt = this.#now();
    const attempts: JudgmentAttemptReceipt[] = [];

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      if (callerSignal?.aborted) {
        throw new JudgmentProviderError("CANCELED", false, attempts);
      }
      const attemptStartedAt = this.#now();
      const remainingMs = this.#runDeadlineMs - (attemptStartedAt - startedAt);
      if (remainingMs <= 0) {
        throw new JudgmentProviderError(
          attempts.at(-1)?.code ?? "PROVIDER_UNAVAILABLE",
          true,
          attempts,
        );
      }
      const controller = new AbortController();
      const abortFromCaller = () => controller.abort();
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
      if (callerSignal?.aborted) controller.abort();
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(this.#timeoutMs, remainingMs),
      );
      try {
        const response = await this.#fetcher(DECISIONS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://jev-trade.dev",
            "X-Title": "Jev Trade",
          },
          body: request.canonicalBody,
          signal: controller.signal,
        });
        const durationMs = Math.max(0, this.#now() - attemptStartedAt);
        if (callerSignal?.aborted) {
          await response.body?.cancel().catch(() => undefined);
          attempts.push(
            Object.freeze({
              attempt,
              code: "CANCELED",
              durationMs,
              status: response.status,
            }),
          );
          throw new JudgmentProviderError("CANCELED", false, attempts);
        }
        if (!response.ok) {
          const code = codeForStatus(response.status);
          const retryAfterMs =
            response.status === 429
              ? parseRetryAfter(
                  response.headers.get("retry-after"),
                  this.#now(),
                )
              : undefined;
          const receipt = Object.freeze({
            attempt,
            code,
            durationMs,
            status: response.status,
            ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
          });
          attempts.push(receipt);
          await response.body?.cancel().catch(() => undefined);
          const retryable = RETRYABLE_STATUSES.has(response.status);
          if (!retryable || attempt === this.#maxAttempts) {
            throw new JudgmentProviderError(code, retryable, attempts);
          }
          clearTimeout(timer);
          await this.#waitForRetry(
            attempt,
            retryAfterMs,
            startedAt,
            code,
            attempts,
          );
          continue;
        }

        if (response.status !== 200) {
          attempts.push(
            Object.freeze({
              attempt,
              code: "INVALID_RESPONSE",
              durationMs,
              status: response.status,
            }),
          );
          await response.body?.cancel().catch(() => undefined);
          throw new JudgmentProviderError("INVALID_RESPONSE", false, attempts);
        }

        let body: string;
        let responseHash: string;
        try {
          ({ responseHash, text: body } = await readBoundedBody(
            response,
            this.#maxResponseBytes,
          ));
        } catch (error) {
          const canceled = callerSignal?.aborted === true;
          attempts.push(
            Object.freeze({
              attempt,
              ...(canceled ? { code: "CANCELED" as const } : {}),
              durationMs,
              status: response.status,
            }),
          );
          if (canceled) {
            throw new JudgmentProviderError("CANCELED", false, attempts);
          }
          if (error instanceof JudgmentProviderError) {
            throw new JudgmentProviderError(error.code, false, attempts);
          }
          throw new JudgmentProviderError("INVALID_RESPONSE", false, attempts);
        }
        const completedDurationMs = Math.max(0, this.#now() - attemptStartedAt);
        attempts.push(
          Object.freeze({
            attempt,
            durationMs: completedDurationMs,
            status: response.status,
          }),
        );
        let validated;
        try {
          validated = parseAndValidateDecisionsResponse(body, {
            expectedResolvedModel:
              request.evaluationMode === "scored"
                ? this.#expectedResolvedModel
                : this.#requestedModel.startsWith("~")
                  ? undefined
                  : this.#expectedResolvedModel,
          });
        } catch (error) {
          if (error instanceof JudgmentProviderError) {
            throw new JudgmentProviderError(error.code, false, attempts);
          }
          throw new JudgmentProviderError("INVALID_RESPONSE", false, attempts);
        }
        return Object.freeze({
          source: "openrouter",
          liveJev: true,
          publishable: request.evaluationMode === "scored",
          evaluationMode: request.evaluationMode,
          contractVersion: JUDGMENT_CONTRACT_VERSION,
          questionSetVersion: QUESTION_SET_VERSION,
          requestHash: request.requestHash,
          receipt: Object.freeze({
            ...(validated.id === undefined ? {} : { responseId: validated.id }),
            requestedModel: request.wire.model,
            resolvedModel: validated.model,
            ...(validated.provider === undefined
              ? {}
              : { provider: validated.provider }),
            usage: validated.usage,
            responseHash,
            attempts: Object.freeze([...attempts]),
          }),
          answers: validated.answers,
        });
      } catch (error) {
        if (error instanceof JudgmentProviderError) throw error;
        const canceled = callerSignal?.aborted === true;
        const code: JudgmentErrorCode = canceled
          ? "CANCELED"
          : controller.signal.aborted ||
              (error instanceof DOMException && error.name === "AbortError")
            ? "TIMEOUT"
            : "PROVIDER_UNAVAILABLE";
        attempts.push(
          Object.freeze({
            attempt,
            code,
            durationMs: Math.max(0, this.#now() - attemptStartedAt),
          }),
        );
        if (canceled) {
          throw new JudgmentProviderError("CANCELED", false, attempts);
        }
        if (attempt === this.#maxAttempts) {
          throw new JudgmentProviderError(code, true, attempts);
        }
        await this.#waitForRetry(attempt, undefined, startedAt, code, attempts);
      } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener("abort", abortFromCaller);
      }
    }
    throw new JudgmentProviderError("PROVIDER_UNAVAILABLE", true, attempts);
  }

  #validateConfiguration(request: JudgmentRequest): void {
    if (
      typeof this.#apiKey !== "string" ||
      this.#apiKey.length < 20 ||
      request.wire.model !== this.#requestedModel ||
      this.#timeoutMs < 1 ||
      this.#runDeadlineMs < this.#timeoutMs ||
      !Number.isInteger(this.#maxAttempts) ||
      this.#maxAttempts < 1 ||
      this.#maxAttempts > 3 ||
      !Number.isInteger(this.#maxResponseBytes) ||
      this.#maxResponseBytes < 1
    ) {
      throw new JudgmentProviderError("CONFIGURATION", false);
    }
    if (
      request.evaluationMode === "scored" &&
      (this.#requestedModel.startsWith("~") || !this.#expectedResolvedModel)
    ) {
      throw new JudgmentProviderError("CONFIGURATION", false);
    }
  }

  async #waitForRetry(
    attempt: number,
    retryAfterMs: number | undefined,
    startedAt: number,
    code: JudgmentErrorCode,
    attempts: readonly JudgmentAttemptReceipt[],
  ): Promise<void> {
    const base = attempt === 1 ? 250 : 1000;
    const delay =
      retryAfterMs ??
      Math.floor(Math.max(0, Math.min(1, this.#random())) * base);
    if (this.#now() - startedAt + delay >= this.#runDeadlineMs) {
      throw new JudgmentProviderError(code, true, attempts);
    }
    await this.#sleeper(delay);
  }
}
