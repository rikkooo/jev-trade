import {
  LEDGER_ROOT_VERSION,
  type LedgerRootDispatchEnvelope,
} from "@/modules/ledger/root-chain";

const HASH = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{7,64}$/;
const EXPECTED_KEYS = [
  "attestationDeadline",
  "batchKey",
  "closedAt",
  "durableBackend",
  "forecastCount",
  "previousRootHash",
  "prospective",
  "rootHash",
  "sourceRevision",
  "version",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalTime(value: unknown, field: string): number {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO-8601 timestamp`);
  }
  return parsed;
}

export function validateDispatchEnvelope(
  value: unknown,
  options: {
    readonly previousPublishedRootHash: string | null;
    readonly observedAt: string;
  },
): LedgerRootDispatchEnvelope {
  if (!isObject(value)) throw new Error("dispatch payload must be an object");
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...EXPECTED_KEYS].sort())) {
    throw new Error("dispatch payload contains missing or unknown fields");
  }
  if (
    value.version !== LEDGER_ROOT_VERSION ||
    value.prospective !== true ||
    value.durableBackend !== true
  ) {
    throw new Error("dispatch payload is not durable prospective evidence");
  }
  if (
    typeof value.batchKey !== "string" ||
    value.batchKey.trim().length === 0
  ) {
    throw new Error("dispatch batch key is invalid");
  }
  if (typeof value.rootHash !== "string" || !HASH.test(value.rootHash)) {
    throw new Error("dispatch root hash is invalid");
  }
  if (
    value.previousRootHash !== null &&
    (typeof value.previousRootHash !== "string" ||
      !HASH.test(value.previousRootHash))
  ) {
    throw new Error("dispatch previous root hash is invalid");
  }
  if (value.previousRootHash !== options.previousPublishedRootHash) {
    throw new Error(
      "dispatch previous root does not match published chain head",
    );
  }
  if (
    !Number.isInteger(value.forecastCount) ||
    (value.forecastCount as number) < 1
  ) {
    throw new Error("dispatch forecast count is invalid");
  }
  if (
    typeof value.sourceRevision !== "string" ||
    !SHA.test(value.sourceRevision)
  ) {
    throw new Error("dispatch source revision is invalid");
  }
  const closedAt = canonicalTime(value.closedAt, "closedAt");
  const deadline = canonicalTime(
    value.attestationDeadline,
    "attestationDeadline",
  );
  const observedAt = canonicalTime(options.observedAt, "observedAt");
  if (closedAt > observedAt)
    throw new Error("dispatch batch closes in the future");
  if (deadline < observedAt)
    throw new Error("dispatch attestation deadline has passed");
  return value as unknown as LedgerRootDispatchEnvelope;
}
