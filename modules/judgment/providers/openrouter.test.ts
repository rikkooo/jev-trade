import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { buildJudgmentRequest, sanitizeJudgmentError } from "../index";
import { buildDemoCompactState } from "../fixtures/demo-state";
import { validResponse } from "../validation.test";
import { OpenRouterJevProvider } from "./openrouter";

const API_KEY = "sk-or-v1-super-secret-test-key";

function request(evaluationMode: "scored" | "sandbox" = "scored") {
  return buildJudgmentRequest({
    marketState: buildDemoCompactState(),
    strategyMode: "position",
    horizonSessions: 20,
    evaluationMode,
  });
}

function response(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

describe("OpenRouterJevProvider", () => {
  it("uses only the direct Decisions endpoint with server-side bearer auth", async () => {
    const responseText = JSON.stringify({
      ...validResponse(),
      additive_metadata: "exact bytes: café",
    });
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return response(responseText);
      },
    );
    const result = await new OpenRouterJevProvider({
      apiKey: API_KEY,
      fetcher,
      sleeper: async () => undefined,
    }).evaluate(request());

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(url).not.toContain("chat/completions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${API_KEY}`,
    );
    expect(init?.body).toBe(request().canonicalBody);
    expect(result.liveJev).toBe(true);
    expect(result.publishable).toBe(true);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(result.receipt.responseHash).toBe(
      createHash("sha256").update(responseText).digest("hex"),
    );
  });

  it("does not call fetch or retry when the caller signal is pre-aborted", async () => {
    const fetcher = vi.fn(async () => response(validResponse()));
    const controller = new AbortController();
    controller.abort("secret caller reason");
    const error = await new OpenRouterJevProvider({ apiKey: API_KEY, fetcher })
      .evaluate(request(), { signal: controller.signal })
      .catch((caught: unknown) => caught);

    expect(fetcher).not.toHaveBeenCalled();
    expect(error).toMatchObject({
      code: "CANCELED",
      retryable: false,
      attempts: [],
    });
    expect(JSON.stringify(sanitizeJudgmentError(error))).not.toContain(
      "secret",
    );
  });

  it("stops an in-flight fetch without retry when the caller explicitly aborts", async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("transport detail", "AbortError")),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const pending = new OpenRouterJevProvider({ apiKey: API_KEY, fetcher })
      .evaluate(request(), { signal: controller.signal })
      .catch((caught: unknown) => caught);
    controller.abort("secret caller reason");
    const error = await pending;

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ code: "CANCELED", retryable: false });
    expect((error as { attempts: unknown[] }).attempts).toHaveLength(1);
    expect(JSON.stringify(sanitizeJudgmentError(error))).not.toContain(
      "secret",
    );
  });

  it("rejects a forged question set before making a network call", async () => {
    const fetcher = vi.fn(async () => response(validResponse()));
    const valid = request();
    const forged = {
      ...valid,
      wire: {
        ...valid.wire,
        questions: {
          ...valid.wire.questions,
          injected: valid.wire.questions.direction,
        },
      },
    };

    await expect(
      new OpenRouterJevProvider({ apiKey: API_KEY, fetcher }).evaluate(
        forged as unknown as typeof valid,
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retries 429, honors a bounded Retry-After, and returns ordered receipts", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response("rate limited", 429, { "Retry-After": "2" }),
      )
      .mockResolvedValueOnce(response(validResponse()));
    const sleeps: number[] = [];
    const result = await new OpenRouterJevProvider({
      apiKey: API_KEY,
      fetcher,
      sleeper: async (milliseconds) => void sleeps.push(milliseconds),
      now: (() => {
        let now = 0;
        return () => ++now;
      })(),
    }).evaluate(request());

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
    expect(result.receipt.attempts.map((attempt) => attempt.status)).toEqual([
      429, 200,
    ]);
  });

  it("skips a retry whose delay cannot fit inside the total run deadline", async () => {
    let now = 0;
    const fetcher = vi.fn(async () => {
      now = 18;
      return response("rate limited", 429, { "Retry-After": "1" });
    });
    const sleeper = vi.fn(async () => undefined);
    await expect(
      new OpenRouterJevProvider({
        apiKey: API_KEY,
        fetcher,
        sleeper,
        now: () => now,
        timeoutMs: 10,
        runDeadlineMs: 20,
      }).evaluate(request()),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleeper).not.toHaveBeenCalled();
  });

  it("recovers after two transient server failures and stops at three attempts", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response("unavailable", 503))
      .mockResolvedValueOnce(response("unavailable", 503))
      .mockResolvedValueOnce(response(validResponse()));
    const sleeps: number[] = [];
    const result = await new OpenRouterJevProvider({
      apiKey: API_KEY,
      fetcher,
      sleeper: async (milliseconds) => void sleeps.push(milliseconds),
      random: () => 0.5,
    }).evaluate(request());

    expect(result.receipt.attempts).toHaveLength(3);
    expect(sleeps).toEqual([125, 500]);
  });

  it("does not sleep or call a fourth time after persistent transient failures", async () => {
    const fetcher = vi.fn(async () => response("unavailable", 503));
    const sleeper = vi.fn(async () => undefined);
    const error = await new OpenRouterJevProvider({
      apiKey: API_KEY,
      fetcher,
      sleeper,
      random: () => 0,
    })
      .evaluate(request())
      .catch((caught: unknown) => caught);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleeper).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
    });
    expect((error as { attempts: unknown[] }).attempts).toHaveLength(3);
  });

  it.each([
    [400, "INVALID_REQUEST"],
    [401, "AUTHENTICATION"],
    [402, "INSUFFICIENT_CREDITS"],
    [403, "AUTHENTICATION"],
    [404, "INVALID_REQUEST"],
    [413, "PAYLOAD_TOO_LARGE"],
    [422, "INVALID_REQUEST"],
  ] as const)("does not retry terminal HTTP %i", async (status, code) => {
    const fetcher = vi.fn(async () =>
      response(`${API_KEY} in unsafe body`, status),
    );
    const provider = new OpenRouterJevProvider({ apiKey: API_KEY, fetcher });

    const error = await provider
      .evaluate(request())
      .catch((caught: unknown) => caught);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ code, retryable: false });
    expect(JSON.stringify(sanitizeJudgmentError(error))).not.toContain(API_KEY);
  });

  it("retries abort timeouts within the cap and returns a safe terminal error", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("secret timeout detail", "AbortError")),
          );
        });
        return response(validResponse());
      },
    );
    const provider = new OpenRouterJevProvider({
      apiKey: API_KEY,
      fetcher,
      timeoutMs: 2,
      sleeper: async () => undefined,
    });

    const error = await provider
      .evaluate(request())
      .catch((caught: unknown) => caught);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({ code: "TIMEOUT", retryable: true });
    expect(JSON.stringify(sanitizeJudgmentError(error))).not.toContain(
      "secret timeout",
    );
  });

  it("does not retry malformed success bodies or unexpected models", async () => {
    for (const body of ["<html>bad</html>", validResponse("typesafe/other")]) {
      const fetcher = vi.fn(async () => response(body));
      await expect(
        new OpenRouterJevProvider({ apiKey: API_KEY, fetcher }).evaluate(
          request(),
        ),
      ).rejects.toMatchObject({
        code: body === "<html>bad</html>" ? "INVALID_RESPONSE" : "MODEL_DRIFT",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects an unexpected successful HTTP status", async () => {
    const fetcher = vi.fn(async () => response(validResponse(), 201));
    await expect(
      new OpenRouterJevProvider({ apiKey: API_KEY, fetcher }).evaluate(
        request(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops reading an oversized response and does not expose its contents", async () => {
    const fetcher = vi.fn(async () => response("x".repeat(1025)));
    const provider = new OpenRouterJevProvider({
      apiKey: API_KEY,
      fetcher,
      maxResponseBytes: 1024,
    });
    await expect(provider.evaluate(request())).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("allows a moving request alias only in non-scored sandbox mode", async () => {
    const aliasRequest = buildJudgmentRequest({
      marketState: buildDemoCompactState(),
      strategyMode: "sprint",
      horizonSessions: 5,
      evaluationMode: "sandbox",
      requestedModel: "~typesafe/jev-latest",
    });
    const fetcher = vi.fn(async () =>
      response(validResponse("typesafe/jev-next")),
    );
    const result = await new OpenRouterJevProvider({
      apiKey: API_KEY,
      requestedModel: "~typesafe/jev-latest",
      fetcher,
    }).evaluate(aliasRequest);
    expect(result.publishable).toBe(false);

    const scoredAlias = { ...aliasRequest, evaluationMode: "scored" as const };
    await expect(
      new OpenRouterJevProvider({
        apiKey: API_KEY,
        requestedModel: "~typesafe/jev-latest",
        fetcher,
      }).evaluate(scoredAlias),
    ).rejects.toMatchObject({ code: "CONFIGURATION" });
  });
});
