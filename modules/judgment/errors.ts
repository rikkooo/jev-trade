import type { JudgmentAttemptReceipt, JudgmentErrorCode } from "./contracts";

const SAFE_MESSAGES: Record<JudgmentErrorCode, string> = {
  CONFIGURATION: "The judgment provider is not configured for this run.",
  CANCELED: "The judgment request was canceled by its caller.",
  INVALID_REQUEST:
    "The judgment request did not satisfy the provider contract.",
  AUTHENTICATION: "The judgment provider rejected its server credential.",
  INSUFFICIENT_CREDITS:
    "The judgment provider account has insufficient credits.",
  PAYLOAD_TOO_LARGE: "The judgment request exceeded its configured size limit.",
  RATE_LIMITED: "The judgment provider rate limit was exhausted.",
  TIMEOUT: "The judgment provider did not respond within the configured time.",
  PROVIDER_UNAVAILABLE: "The judgment provider is temporarily unavailable.",
  INVALID_RESPONSE: "The judgment provider returned an invalid typed response.",
  MODEL_DRIFT: "The judgment provider returned an unapproved model build.",
};

export class JudgmentProviderError extends Error {
  readonly code: JudgmentErrorCode;
  readonly retryable: boolean;
  readonly attempts: readonly JudgmentAttemptReceipt[];

  constructor(
    code: JudgmentErrorCode,
    retryable: boolean,
    attempts: readonly JudgmentAttemptReceipt[] = [],
  ) {
    super(SAFE_MESSAGES[code]);
    this.name = "JudgmentProviderError";
    this.code = code;
    this.retryable = retryable;
    this.attempts = Object.freeze(
      attempts.map((attempt) => Object.freeze({ ...attempt })),
    );
  }
}

export interface SanitizedJudgmentError {
  readonly name: "JudgmentProviderError";
  readonly code: JudgmentErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly attempts: readonly JudgmentAttemptReceipt[];
}

export function sanitizeJudgmentError(error: unknown): SanitizedJudgmentError {
  const safe =
    error instanceof JudgmentProviderError
      ? error
      : new JudgmentProviderError("PROVIDER_UNAVAILABLE", false);
  return {
    name: "JudgmentProviderError",
    code: safe.code,
    message: SAFE_MESSAGES[safe.code],
    retryable: safe.retryable,
    attempts: safe.attempts.map((attempt) => ({ ...attempt })),
  };
}
