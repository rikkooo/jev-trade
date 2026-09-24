import { invalid } from "../errors";
import {
  verifySeal,
  type EvidenceLabRecordKind,
  type Sealed,
  type SealedRecord,
} from "../model/hashing";

type ZodLike<T> = {
  safeParse(value: unknown): {
    success: boolean;
    data?: T;
    error?: { issues: readonly { path: PropertyKey[]; message: string }[] };
  };
};

export function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function parseSealed<T>(
  kind: EvidenceLabRecordKind,
  schema: ZodLike<T>,
  input: unknown,
): SealedRecord<T> {
  if (!input || typeof input !== "object") invalid(`${kind} must be an object`);
  const payload = verifySeal(kind, input as Sealed);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const detail = (parsed.error?.issues ?? [])
      .map(
        (issue) =>
          `${issue.path.map(String).join(".") || kind}: ${issue.message}`,
      )
      .join("; ");
    invalid(`${kind} is invalid: ${detail}`);
  }
  return freezeDeep(structuredClone(input) as SealedRecord<T>);
}
