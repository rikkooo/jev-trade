import type { JsonValue } from "@/modules/ledger/canonical-json";

import {
  computeEvidenceLabContentHash,
  type CohortEvent,
  type Cohort,
  type EvidenceState,
  type PublicationReceipt,
  type RegistryEntry,
  type SourceRevision,
  type VersionTuple,
} from "./contracts";

const hash = (letter: string) => letter.repeat(64);

export const fixtureVersionTuple: VersionTuple = {
  packProfile: "pack-v1",
  model: "model-v1",
  prompt: "prompt-v1",
  feature: "feature-v1",
  policy: "policy-v1",
  execution: "execution-v1",
  costScenario: "cost-v1",
  outcome: "outcome-v1",
  baseline: "baseline-v1",
  metric: "metric-v1",
  build: "build-v1",
};

export function makeFixtureRegistryEntry(
  overrides: Partial<
    Omit<RegistryEntry, "canonicalPayload" | "contentHash">
  > = {},
): RegistryEntry {
  const base = {
    id: "registry_01",
    kind: "PACK" as const,
    version: "pack-v1",
    payload: { fixture: true, pack: "day" } satisfies JsonValue,
    ...overrides,
  };
  return { ...base, ...computeEvidenceLabContentHash("registry_entry", base) };
}

export function makeFixtureSourceRevision(
  overrides: Partial<
    Omit<SourceRevision, "canonicalPayload" | "contentHash">
  > = {},
): SourceRevision {
  const base = {
    id: "source_01",
    sourceId: "fixture:day:AAPL",
    revision: "v1",
    sourceHash: hash("a"),
    payloadHash: hash("b"),
    publishedAt: "2026-09-20T08:00:00.000Z",
    effectiveAt: "2026-09-20T08:01:00.000Z",
    ingestedAt: "2026-09-20T08:02:00.000Z",
    availableAt: "2026-09-20T08:03:00.000Z",
    correctionAt: null,
    supersedesSourceRevisionId: null,
    disclosureClass: "PROTECTED" as const,
    ...overrides,
  };
  return {
    ...base,
    ...computeEvidenceLabContentHash("source_revision", base as JsonValue),
  };
}

export function makeFixtureEvidenceState(
  overrides: Partial<
    Omit<EvidenceState, "canonicalPayload" | "contentHash">
  > = {},
): EvidenceState {
  const base = {
    id: "evidence_01",
    pack: "day" as const,
    cutoffAt: "2026-09-20T09:00:00.000Z",
    sourceRevisionIds: ["source_01"],
    admissionManifestHash: hash("c"),
    normalizedState: {
      kind: "synthetic_fixture",
      symbol: "AAPL",
    } satisfies JsonValue,
    ...overrides,
  };
  return {
    ...base,
    ...computeEvidenceLabContentHash("evidence_state", base as JsonValue),
  };
}

export function makeFixtureCohort(
  overrides: Partial<Omit<Cohort, "canonicalPayload" | "contentHash">> = {},
): Cohort {
  const base = {
    id: "cohort_01",
    pack: "day" as const,
    mode: "fixture" as const,
    versions: fixtureVersionTuple,
    status: "DRAFT" as const,
    ...overrides,
  };
  return {
    ...base,
    ...computeEvidenceLabContentHash("cohort", base as JsonValue),
  };
}

export function makeFixtureCohortEvent(
  overrides: Partial<
    Omit<CohortEvent, "canonicalPayload" | "contentHash">
  > = {},
): CohortEvent {
  const base = {
    id: "cohort_event_01",
    cohortId: "cohort_01",
    type: "VALIDATED" as const,
    effectiveAt: "2026-09-20T09:01:00.000Z",
    predecessorEventId: null,
    ...overrides,
  };
  return {
    ...base,
    ...computeEvidenceLabContentHash("cohort_event", base as JsonValue),
  };
}

export function makeFixturePublicationReceipt(
  overrides: Partial<
    Omit<PublicationReceipt, "canonicalPayload" | "contentHash">
  > = {},
): PublicationReceipt {
  const base = {
    id: "receipt_01",
    batchId: "batch_01",
    sink: "fixture-independent-timestamp-sink",
    rootHash: hash("d"),
    submittedAt: "2026-09-20T09:01:00.000Z",
    receivedAt: "2026-09-20T09:02:00.000Z",
    deadlineAt: "2026-09-20T10:00:00.000Z",
    status: "TIMELY" as const,
    receiptPayloadHash: hash("e"),
    ...overrides,
  };
  return {
    ...base,
    ...computeEvidenceLabContentHash("publication_receipt", base as JsonValue),
  };
}
