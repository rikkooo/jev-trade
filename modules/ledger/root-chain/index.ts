import { sha256Canonical } from "../canonical-json";

export const LEDGER_ROOT_VERSION = "jev-ledger-root/v1" as const;
export const MANUAL_PROOF_VERSION = "jev-ledger-manual-proof/v1" as const;

export interface ForecastCommitment {
  readonly forecastId: string;
  readonly contentHash: string;
}

export interface LedgerRootInput {
  readonly batchKey: string;
  readonly closedAt: string;
  readonly attestationDeadline: string;
  readonly previousRootHash: string | null;
  readonly commitments: readonly ForecastCommitment[];
}

export interface LedgerRoot extends LedgerRootInput {
  readonly version: typeof LEDGER_ROOT_VERSION;
  readonly commitments: readonly ForecastCommitment[];
  readonly forecastCount: number;
  readonly rootHash: string;
}

export interface LedgerRootDispatchEnvelope {
  readonly version: typeof LEDGER_ROOT_VERSION;
  readonly batchKey: string;
  readonly rootHash: string;
  readonly previousRootHash: string | null;
  readonly closedAt: string;
  readonly attestationDeadline: string;
  readonly forecastCount: number;
  readonly prospective: true;
  readonly durableBackend: true;
  readonly sourceRevision: string;
}

export interface ManualFixtureProof {
  readonly version: typeof MANUAL_PROOF_VERSION;
  readonly evidenceClass: "fixture_manual_only";
  readonly prospectiveScorecardEligible: false;
  readonly externalAttestation: "absent";
  readonly generatedAt: string;
  readonly chain: readonly LedgerRoot[];
  readonly proofHash: string;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function assertIso(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO-8601 timestamp`);
  }
  return parsed;
}

function canonicalCommitments(
  commitments: readonly ForecastCommitment[],
): readonly ForecastCommitment[] {
  if (commitments.length === 0) {
    throw new Error("ledger root batch must contain at least one forecast");
  }
  const result = commitments
    .map(({ forecastId, contentHash }) => {
      if (forecastId.trim() !== forecastId || forecastId.length === 0) {
        throw new Error("forecast commitment ID must be non-empty and trimmed");
      }
      if (!HASH_PATTERN.test(contentHash)) {
        throw new Error(`forecast ${forecastId} content hash is invalid`);
      }
      return { forecastId, contentHash };
    })
    .sort((left, right) =>
      left.forecastId < right.forecastId
        ? -1
        : left.forecastId > right.forecastId
          ? 1
          : 0,
    );
  if (
    new Set(result.map(({ forecastId }) => forecastId)).size !== result.length
  ) {
    throw new Error("ledger root batch contains a duplicate forecast ID");
  }
  return result;
}

function rootHashPayload(root: Omit<LedgerRoot, "forecastCount" | "rootHash">) {
  return {
    version: root.version,
    batchKey: root.batchKey,
    closedAt: root.closedAt,
    attestationDeadline: root.attestationDeadline,
    previousRootHash: root.previousRootHash,
    commitments: root.commitments,
  };
}

export function buildLedgerRoot(input: LedgerRootInput): LedgerRoot {
  if (input.batchKey.trim() !== input.batchKey || input.batchKey.length === 0) {
    throw new Error("ledger root batch key must be non-empty and trimmed");
  }
  const closedAt = assertIso(input.closedAt, "closedAt");
  const deadline = assertIso(input.attestationDeadline, "attestationDeadline");
  if (deadline < closedAt) {
    throw new Error("attestation deadline cannot precede batch close");
  }
  if (
    input.previousRootHash !== null &&
    !HASH_PATTERN.test(input.previousRootHash)
  ) {
    throw new Error("previous root hash is invalid");
  }
  const commitments = canonicalCommitments(input.commitments);
  const rootWithoutHash = {
    version: LEDGER_ROOT_VERSION,
    batchKey: input.batchKey,
    closedAt: input.closedAt,
    attestationDeadline: input.attestationDeadline,
    previousRootHash: input.previousRootHash,
    commitments,
  };
  return {
    ...rootWithoutHash,
    forecastCount: commitments.length,
    rootHash: sha256Canonical(rootHashPayload(rootWithoutHash)),
  };
}

export function verifyLedgerChain(chain: readonly LedgerRoot[]): {
  readonly valid: true;
  readonly batchCount: number;
  readonly forecastCount: number;
  readonly headRootHash: string | null;
} {
  let previous: LedgerRoot | undefined;
  const batchKeys = new Set<string>();
  const forecastIds = new Set<string>();
  for (const root of chain) {
    if (!previous && root.previousRootHash !== null) {
      throw new Error("first root must not name a previous root");
    }
    if (previous && root.previousRootHash !== previous.rootHash) {
      throw new Error(`previous-root continuity failed for ${root.batchKey}`);
    }
    if (previous && root.closedAt <= previous.closedAt) {
      throw new Error(
        "ledger root close timestamps must be strictly increasing",
      );
    }
    if (batchKeys.has(root.batchKey)) {
      throw new Error(`duplicate ledger root batch key ${root.batchKey}`);
    }
    batchKeys.add(root.batchKey);
    const rebuilt = buildLedgerRoot(root);
    if (rebuilt.rootHash !== root.rootHash) {
      throw new Error(`root hash mismatch for ${root.batchKey}`);
    }
    if (root.forecastCount !== root.commitments.length) {
      throw new Error(`forecast count mismatch for ${root.batchKey}`);
    }
    for (const commitment of root.commitments) {
      if (forecastIds.has(commitment.forecastId)) {
        throw new Error(
          `forecast ${commitment.forecastId} occurs in more than one batch`,
        );
      }
      forecastIds.add(commitment.forecastId);
    }
    previous = root;
  }
  return {
    valid: true,
    batchCount: chain.length,
    forecastCount: forecastIds.size,
    headRootHash: previous?.rootHash ?? null,
  };
}

export function isTimelyAttestation(
  root: LedgerRoot,
  attestedAt: string | null,
): boolean {
  if (attestedAt === null) return false;
  return (
    assertIso(attestedAt, "attestedAt") <=
    assertIso(root.attestationDeadline, "attestationDeadline")
  );
}

export function toDispatchEnvelope(
  root: LedgerRoot,
  sourceRevision: string,
): LedgerRootDispatchEnvelope {
  if (!/^[0-9a-f]{7,64}$/.test(sourceRevision)) {
    throw new Error("source revision must be a 7-64 character Git SHA");
  }
  const rebuilt = buildLedgerRoot(root);
  if (
    rebuilt.rootHash !== root.rootHash ||
    rebuilt.forecastCount !== root.forecastCount
  ) {
    throw new Error(`root hash mismatch for ${root.batchKey}`);
  }
  return {
    version: root.version,
    batchKey: root.batchKey,
    rootHash: root.rootHash,
    previousRootHash: root.previousRootHash,
    closedAt: root.closedAt,
    attestationDeadline: root.attestationDeadline,
    forecastCount: root.forecastCount,
    prospective: true,
    durableBackend: true,
    sourceRevision,
  };
}

function manualProofPayload(proof: Omit<ManualFixtureProof, "proofHash">) {
  return {
    version: proof.version,
    evidenceClass: proof.evidenceClass,
    prospectiveScorecardEligible: proof.prospectiveScorecardEligible,
    externalAttestation: proof.externalAttestation,
    generatedAt: proof.generatedAt,
    chain: proof.chain,
  };
}

export function createManualFixtureProof(
  chain: readonly LedgerRoot[],
  generatedAt: string,
): ManualFixtureProof {
  assertIso(generatedAt, "generatedAt");
  verifyLedgerChain(chain);
  const proofWithoutHash = {
    version: MANUAL_PROOF_VERSION,
    evidenceClass: "fixture_manual_only" as const,
    prospectiveScorecardEligible: false as const,
    externalAttestation: "absent" as const,
    generatedAt,
    chain,
  };
  return {
    ...proofWithoutHash,
    proofHash: sha256Canonical(manualProofPayload(proofWithoutHash)),
  };
}

export function verifyManualFixtureProof(proof: ManualFixtureProof): {
  readonly valid: true;
  readonly proofHash: string;
  readonly chainHead: string | null;
} {
  if (
    proof.version !== MANUAL_PROOF_VERSION ||
    proof.evidenceClass !== "fixture_manual_only" ||
    proof.prospectiveScorecardEligible !== false ||
    proof.externalAttestation !== "absent"
  ) {
    throw new Error("manual fixture proof classification is invalid");
  }
  assertIso(proof.generatedAt, "generatedAt");
  const chain = verifyLedgerChain(proof.chain);
  const expected = sha256Canonical(manualProofPayload(proof));
  if (proof.proofHash !== expected) {
    throw new Error("manual fixture proof hash mismatch");
  }
  return {
    valid: true,
    proofHash: proof.proofHash,
    chainHead: chain.headRootHash,
  };
}
