/**
 * Typed Evidence Lab failures. Codes mirror the SQLSTATE classes raised by
 * migration `0002_evidence_lab_registry` so fixture and database stores fail
 * the same way.
 */
export type EvidenceLabErrorCode =
  | "VALIDATION"
  | "CONFLICT"
  | "MISSING_REFERENCE"
  | "ILLEGAL_TRANSITION"
  | "GATED"
  | "FORBIDDEN"
  | "UNAVAILABLE";

export class EvidenceLabError extends Error {
  constructor(
    readonly code: EvidenceLabErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EvidenceLabError";
  }
}

export function invalid(message: string): never {
  throw new EvidenceLabError("VALIDATION", message);
}

const SQLSTATE_CODES: Readonly<Record<string, EvidenceLabErrorCode>> = {
  "22023": "VALIDATION",
  "22P02": "VALIDATION",
  "23514": "VALIDATION",
  "23505": "CONFLICT",
  "23503": "MISSING_REFERENCE",
  "55000": "ILLEGAL_TRANSITION",
  JTG01: "GATED",
  "42501": "FORBIDDEN",
};

/**
 * Converts a database failure into a typed error. Only messages raised by
 * the Evidence Lab procedures or by constraint names are forwarded; any
 * other driver text, which could echo connection details, is replaced.
 */
export function fromDatabaseError(error: unknown): EvidenceLabError {
  const sqlState =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const code = SQLSTATE_CODES[sqlState];
  if (!code) {
    return new EvidenceLabError("UNAVAILABLE", "database operation failed");
  }
  const message =
    error instanceof Error && !/:\/\//.test(error.message)
      ? error.message
      : "database operation rejected";
  return new EvidenceLabError(code, message);
}
