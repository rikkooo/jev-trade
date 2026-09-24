import { z } from "zod";

import type { JsonValue } from "@/modules/ledger/canonical-json";

/** Record identifiers: printable, whitespace-free, and bounded. */
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/;
export const HASH_PATTERN = /^[a-f0-9]{64}$/;
export const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,11}$/;
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
export const REVIEW_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$/;
export const SINK_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,79}$/;
/** Canonical UTC instant with millisecond precision, as `Date#toISOString`. */
export const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;

export const identifierSchema = z.string().regex(IDENTIFIER_PATTERN);
export const versionSchema = z.string().regex(VERSION_PATTERN);
export const hashSchema = z.string().regex(HASH_PATTERN);
export const symbolSchema = z.string().regex(SYMBOL_PATTERN);
export const codeSchema = z.string().regex(CODE_PATTERN);
export const idempotencyKeySchema = z.string().regex(IDEMPOTENCY_KEY_PATTERN);
export const reviewReferenceSchema = z.string().regex(REVIEW_REFERENCE_PATTERN);
export const sinkIdSchema = z.string().regex(SINK_ID_PATTERN);
export const gitShaSchema = z.string().regex(GIT_SHA_PATTERN);

/** Bounded single-line operator or methodology text. */
export const reasonSchema = z
  .string()
  .min(1)
  .max(500)
  // C0 and C1 controls, matching PostgreSQL's [:cntrl:] in the migration.
  .regex(
    /^[^\u0000-\u001f\u007f-\u009f]+$/,
    "must not contain control characters",
  );

export const timestampSchema = z
  .string()
  .regex(TIMESTAMP_PATTERN)
  .refine(
    (value) => {
      const parsed = Date.parse(value);
      return (
        Number.isFinite(parsed) && new Date(parsed).toISOString() === value
      );
    },
    { message: "must be a canonical UTC timestamp" },
  );

export const packSchema = z.enum(["scalping", "day", "swing", "long-term"]);
export type EvidenceLabPack = z.infer<typeof packSchema>;
export const PACKS = packSchema.options;

export const modeSchema = z.enum(["fixture", "replay", "prospective"]);
export type EvidenceLabMode = z.infer<typeof modeSchema>;

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
export type JsonObject = { [key: string]: JsonValue };

export function epochMs(timestamp: string): number {
  return Date.parse(timestamp);
}

/** Code-unit order, identical to PostgreSQL `COLLATE "C"` for the ASCII identifiers used here. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isStrictlySorted(values: readonly string[]): boolean {
  return values.every(
    (value, index) =>
      index === 0 || compareCodeUnits(values[index - 1] as string, value) < 0,
  );
}
