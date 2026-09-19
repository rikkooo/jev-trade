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

const ARCHIVED_KEYS = [...EXPECTED_KEYS, "verifiedAt"] as const;

export interface ArchivedLedgerRoot extends LedgerRootDispatchEnvelope {
  readonly verifiedAt: string;
}

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

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expected].sort())
  );
}

export function parseDispatchEnvelope(
  value: unknown,
): LedgerRootDispatchEnvelope {
  if (!isObject(value)) throw new Error("dispatch payload must be an object");
  if (!hasExactKeys(value, EXPECTED_KEYS)) {
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
  if (deadline < closedAt) {
    throw new Error("dispatch attestation deadline precedes batch close");
  }
  return value as unknown as LedgerRootDispatchEnvelope;
}

export function parseArchivedLedgerRoot(value: unknown): ArchivedLedgerRoot {
  if (!isObject(value) || !hasExactKeys(value, ARCHIVED_KEYS)) {
    throw new Error("archived ledger root contains missing or unknown fields");
  }
  const { verifiedAt, ...envelopeValue } = value;
  canonicalTime(verifiedAt, "verifiedAt");
  return {
    ...parseDispatchEnvelope(envelopeValue),
    verifiedAt: verifiedAt as string,
  };
}

export function dispatchEnvelopeMatchesArchive(
  envelope: LedgerRootDispatchEnvelope,
  archived: ArchivedLedgerRoot,
): boolean {
  return EXPECTED_KEYS.every((key) => envelope[key] === archived[key]);
}

export function assertBeforeAttestationDeadline(
  value: unknown,
  observedAt: string,
): number {
  const archived = parseArchivedLedgerRoot(value);
  const remaining =
    canonicalTime(archived.attestationDeadline, "attestationDeadline") -
    canonicalTime(observedAt, "observedAt");
  if (remaining <= 0) {
    throw new Error("attestation deadline has been reached");
  }
  return remaining;
}

export function validateDispatchEnvelope(
  value: unknown,
  options: {
    readonly previousPublishedRootHash: string | null;
    readonly observedAt: string;
    readonly allowExpiredForArchive?: boolean;
    readonly existingPublishedRoot?: unknown;
  },
): LedgerRootDispatchEnvelope {
  const envelope = parseDispatchEnvelope(value);
  let archived: ArchivedLedgerRoot | undefined;
  if (options.existingPublishedRoot !== undefined) {
    try {
      archived = parseArchivedLedgerRoot(options.existingPublishedRoot);
    } catch (error) {
      throw new Error("archived replay evidence is invalid", { cause: error });
    }
    if (!dispatchEnvelopeMatchesArchive(envelope, archived)) {
      throw new Error(
        "archived replay does not match the original dispatch envelope",
      );
    }
  }
  if (envelope.previousRootHash !== options.previousPublishedRootHash) {
    if (!archived) {
      throw new Error(
        "dispatch previous root does not match published chain head",
      );
    }
  }
  const closedAt = canonicalTime(envelope.closedAt, "closedAt");
  const deadline = canonicalTime(
    envelope.attestationDeadline,
    "attestationDeadline",
  );
  const observedAt = canonicalTime(options.observedAt, "observedAt");
  if (closedAt > observedAt)
    throw new Error("dispatch batch closes in the future");
  if (deadline < observedAt && !options.allowExpiredForArchive)
    throw new Error("dispatch attestation deadline has passed");
  return envelope;
}

export function verifyAndSerializeDispatchArtifact(
  value: unknown,
  options: {
    readonly previousPublishedRootHash: string | null;
    readonly observedAt: string;
    readonly allowExpiredForArchive?: boolean;
    readonly existingPublishedRootBytes?: string;
  },
): string {
  const existingPublishedRoot =
    options.existingPublishedRootBytes === undefined
      ? undefined
      : (JSON.parse(options.existingPublishedRootBytes) as unknown);
  const verified = validateDispatchEnvelope(value, {
    previousPublishedRootHash: options.previousPublishedRootHash,
    observedAt: options.observedAt,
    allowExpiredForArchive: options.allowExpiredForArchive,
    existingPublishedRoot,
  });

  if (options.existingPublishedRootBytes !== undefined) {
    return options.existingPublishedRootBytes;
  }

  return `${JSON.stringify({ ...verified, verifiedAt: options.observedAt }, null, 2)}\n`;
}
