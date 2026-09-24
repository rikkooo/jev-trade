/**
 * Deterministic, fixture-only Evidence Lab records. Every value is synthetic;
 * no provider payload, credential, or real review is represented. The same
 * ordered operations drive the in-memory ledger and the PostgreSQL
 * procedures, so both must produce identical content hashes.
 */
import { sha256Text } from "@/modules/ledger/canonical-json";

import {
  commandRequestHash,
  admissionManifestHash,
  normalizedStateHash,
  registryRootHash,
  seal,
  type SealedRecord,
} from "../model/hashing";
import {
  COST_SCENARIO_SCHEMA,
  PACK_PROFILE_SCHEMA,
  PACK_REQUIREMENTS,
  PACK_VOCABULARY,
  RISK_WINDOWS,
  type Horizon,
  type PackProfile,
} from "../model/packs";
import {
  compareCodeUnits,
  type EvidenceLabMode,
  type EvidenceLabPack,
} from "../model/primitives";
import {
  COHORT_METHODOLOGY_SCHEMA,
  PROSPECTIVE_EVIDENCE_FLOOR,
  type CohortEventFields,
  type CohortFields,
  type CohortForecastLockFields,
  type CohortMethodology,
  type RegistryTuple,
} from "../model/cohorts";
import {
  OPERATOR_COMMANDS,
  REGISTRY_SLOTS,
  operatorFingerprint,
  type OperatorAuditFields,
  type OperatorCommand,
  type RegistryEntryFields,
  type RegistryEventFields,
  type RegistrySlot,
} from "../model/registry";
import type { ReceiptObservationFields } from "../model/receipts";
import type {
  Admission,
  EvidenceStateFields,
  SourceRevisionFields,
} from "../model/sources";

export const FIXTURE_ACTOR_FINGERPRINT = operatorFingerprint(
  "fixture-operator-credential-placeholder-0000",
);

const hashOf = (label: string) =>
  sha256Text(`jev-evidence-lab-fixture:${label}`);

// Pack profiles ----------------------------------------------------------------

const FIXTURE_HORIZONS: Readonly<Record<EvidenceLabPack, readonly Horizon[]>> =
  {
    scalping: [10, 30, 45, 60, 300].map((seconds) => ({
      id: `${seconds}s`,
      kind: "DURATION" as const,
      seconds,
    })),
    day: [
      ...[15, 60, 120, 240].map((minutes) => ({
        id: `${minutes}m`,
        kind: "DURATION" as const,
        seconds: minutes * 60,
      })),
      { id: "session-close", kind: "SESSION_CLOSE" as const },
    ],
    swing: [2, 5, 10, 15].map((sessions) => ({
      id: `${sessions}-sessions`,
      kind: "TRADING_SESSIONS" as const,
      sessions,
    })),
    "long-term": [180, 365, 730].map((days) => ({
      id: `${days}d`,
      kind: "CALENDAR_DAYS" as const,
      days,
    })),
  };

const sortedCopy = <T extends string>(values: readonly T[]): T[] =>
  [...values].sort(compareCodeUnits);

export function fixturePackProfile(pack: EvidenceLabPack): PackProfile {
  const vocabulary = PACK_VOCABULARY[pack];
  const requirements = PACK_REQUIREMENTS[pack];
  const horizons = FIXTURE_HORIZONS[pack];
  return {
    schema: PACK_PROFILE_SCHEMA,
    pack,
    profileVersion: "fixture-v1",
    stances: [...vocabulary.stances],
    actions: [...vocabulary.actions],
    positionSides: [...vocabulary.positionSides],
    executionEvents: [...vocabulary.executionEvents],
    arms: ["standard-tools", "jev", "full-jev-trade", "naive-controls"],
    horizons: horizons.map((horizon) => ({ ...horizon })),
    riskWindows:
      pack === "scalping"
        ? []
        : sortedCopy(pack === "long-term" ? ["1w"] : [...RISK_WINDOWS]),
    inputs: {
      evidenceGranularity: requirements.evidenceGranularity,
      timestampPrecision: requirements.coarsestTimestampPrecision,
      sourceKinds: sortedCopy(requirements.inputs),
    },
    features: sortedCopy(requirements.features),
    costs: {
      components: sortedCopy(requirements.costComponents),
      scenarios: ["BASE", "ADVERSE"],
    },
    shortSelling:
      pack === "long-term"
        ? { permitted: false }
        : {
            permitted: true,
            requiresLocate: true,
            unavailableLocate: "FAIL_CLOSED",
            borrowCostModel:
              pack === "swing" ? "TIME_DEPENDENT" : "PER_SESSION",
          },
    session:
      pack === "day"
        ? {
            forcedCloseBeforeSessionEnd: true,
            closeBufferMinutes: 5,
            calendar: "EXCHANGE",
          }
        : { forcedCloseBeforeSessionEnd: false },
    resolution: {
      rule: "FIRST_ELIGIBLE_FORWARD_OBSERVATION",
      outcomeStates: [
        "UNRESOLVED",
        "UNAVAILABLE",
        "ADJUSTED",
        "VOID",
        "RESOLVED",
      ],
      neutralBandBps: Object.fromEntries(
        horizons.map((horizon, index) => [horizon.id, 5 * (index + 1)]),
      ),
      corporateActionAdjustment: requirements.corporateActionAdjustment,
      voidTriggers: ["DELISTING", "HALT", "MISSING_DATA", "PROVIDER_FAILURE"],
    },
    baselines: sortedCopy(requirements.baselines),
    valuesProvenance: {
      kind: "FIXTURE_PLACEHOLDER",
      note: "Fixture placeholder values; the pack card selects real values from training-only data.",
    },
  };
}

function registryPayload(pack: EvidenceLabPack, slot: RegistrySlot) {
  if (slot === "packProfile") return fixturePackProfile(pack);
  if (slot === "costScenarios") {
    const components = PACK_REQUIREMENTS[pack].costComponents;
    return {
      schema: COST_SCENARIO_SCHEMA,
      pack,
      units: "BPS_OR_MILLISECONDS",
      base: Object.fromEntries(components.map((component) => [component, 2])),
      adverse: Object.fromEntries(
        components.map((component) => [component, 6]),
      ),
      evidenceBasis: "Fixture placeholder; not an observed cost or locate.",
    };
  }
  return {
    schema: `jev-evidence-lab-${REGISTRY_SLOTS[slot].toLowerCase().replaceAll("_", "-")}/v1`,
    description: `Fixture ${slot} manifest for ${pack}`,
    fixture: true,
  };
}

export function fixtureRegistryEntry(
  pack: EvidenceLabPack,
  slot: RegistrySlot,
  overrides: Partial<RegistryEntryFields> = {},
): SealedRecord<RegistryEntryFields> {
  return seal("registry_entry", {
    id: `fx-${pack}-${slot}-v1`,
    kind: REGISTRY_SLOTS[slot],
    version: `fx-${pack}-${slot}-v1`,
    pack,
    supersedesEntryId: null,
    payload: registryPayload(pack, slot) as RegistryEntryFields["payload"],
    ...overrides,
  });
}

// Operator audit ---------------------------------------------------------------

export function fixtureAudit(
  command: OperatorCommand,
  target: { readonly id: string; readonly contentHash: string },
  sequence: string,
  overrides: Partial<OperatorAuditFields> = {},
): SealedRecord<OperatorAuditFields> {
  const targetKind = OPERATOR_COMMANDS[command];
  return seal("operator_audit_event", {
    id: `fx-audit-${sequence}`,
    command,
    outcome: "ACCEPTED",
    rejectionCode: null,
    credentialClass: "OPERATOR_TOKEN",
    actorFingerprint: FIXTURE_ACTOR_FINGERPRINT,
    idempotencyKey: `fx-idempotency-${sequence}`,
    requestHash: commandRequestHash({
      command,
      targetKind,
      targetId: target.id,
      targetContentHash: target.contentHash,
    }),
    targetKind,
    targetId: target.id,
    ...overrides,
  });
}

export function fixtureRegistryEvent(
  entryId: string,
  eventType: RegistryEventFields["eventType"],
): SealedRecord<RegistryEventFields> {
  return seal("registry_event", {
    id: `${entryId}-${eventType.toLowerCase()}`,
    registryEntryId: entryId,
    eventType,
    reason: `Fixture ${eventType.toLowerCase()} transition`,
    reviewReference:
      eventType === "APPROVED" ? "fixture-only:not-a-review" : null,
  });
}

// Cohorts ------------------------------------------------------------------------

export function fixtureRegistryTuple(
  entries: Readonly<Record<RegistrySlot, SealedRecord<RegistryEntryFields>>>,
): { readonly tuple: RegistryTuple; readonly rootHash: string } {
  const slots = Object.keys(REGISTRY_SLOTS) as RegistrySlot[];
  const tuple = Object.fromEntries(
    slots.map((slot) => [
      slot,
      { entryId: entries[slot].id, contentHash: entries[slot].contentHash },
    ]),
  ) as RegistryTuple;
  const rootHash = registryRootHash(
    slots.map((slot) => ({
      slot,
      kind: REGISTRY_SLOTS[slot],
      entryId: entries[slot].id,
      contentHash: entries[slot].contentHash,
    })),
  );
  return { tuple, rootHash };
}

export function fixtureMethodology(
  pack: EvidenceLabPack,
  mode: EvidenceLabMode,
): CohortMethodology {
  const floor = mode === "prospective";
  return {
    schema: COHORT_METHODOLOGY_SCHEMA,
    horizons: FIXTURE_HORIZONS[pack].slice(0, 2).map((horizon) => horizon.id),
    universe: {
      symbols: ["AAPL", "MSFT", "SPY"],
      snapshotHash: hashOf(`${pack}:universe`),
    },
    arms: ["standard-tools", "jev", "full-jev-trade", "naive-controls"],
    eligibilityRules: [
      {
        id: "listed-regular-session",
        description: "Listed and trading in its regular session",
      },
    ],
    exclusions: [{ symbol: "SPY", reason: "Benchmark only; never forecast" }],
    voidRules: [
      { id: "delisted", description: "Void when delisted before maturity" },
      { id: "halted", description: "Void when halted through the horizon" },
    ],
    primaryMetrics: ["log-loss", "multiclass-brier"],
    minimumEvidence: floor
      ? { ...PROSPECTIVE_EVIDENCE_FLOOR }
      : {
          resolvedForecasts: 10,
          symbols: 2,
          resolvedPerHorizon: 5,
          clusters: 2,
        },
    stopRules: [
      {
        id: "budget-exhausted",
        description: "Stop when the declared budget is spent",
      },
    ],
    cadence: {
      kind: "SCHEDULED",
      minimumIntervalSeconds: pack === "scalping" ? 10 : 900,
    },
    budget: { maxRunsPerDay: 100, maxModelCallsPerDay: 0 },
    seeds: { naiveControl: 20260920 },
  };
}

export function fixtureCohort(
  pack: EvidenceLabPack,
  entries: Readonly<Record<RegistrySlot, SealedRecord<RegistryEntryFields>>>,
  overrides: Partial<CohortFields> = {},
): SealedRecord<CohortFields> {
  const mode = overrides.mode ?? "fixture";
  const { tuple, rootHash } = fixtureRegistryTuple(entries);
  return seal("cohort", {
    id: `fx-cohort-${pack}-v1`,
    pack,
    mode,
    cohortVersion: 1,
    predecessorCohortId: null,
    registryTuple: tuple,
    registryRootHash: rootHash,
    methodology: fixtureMethodology(pack, mode),
    ...overrides,
  });
}

export function fixtureCohortEvent(
  cohortId: string,
  eventType: CohortEventFields["eventType"],
  overrides: Partial<CohortEventFields> = {},
): SealedRecord<CohortEventFields> {
  return seal("cohort_event", {
    id: `${cohortId}-${eventType.toLowerCase()}`,
    cohortId,
    eventType,
    reason: `Fixture ${eventType.toLowerCase()} event`,
    scheduledEffectiveAt:
      eventType === "ACTIVATION_SCHEDULED" ? "2099-01-04T14:30:00.000Z" : null,
    correctsEventId: null,
    ...overrides,
  });
}

export function fixtureForecastLock(
  cohort: SealedRecord<CohortFields>,
  firstForecastRef: string,
): SealedRecord<CohortForecastLockFields> {
  return seal("cohort_forecast_lock", {
    id: `${cohort.id}-first-forecast`,
    cohortId: cohort.id,
    firstForecastRef,
    lockedRegistryRootHash: cohort.registryRootHash,
    reason: "First fixture forecast freezes the cohort tuple",
  });
}

// Sources and evidence states ---------------------------------------------------

export function fixtureSource(
  overrides: Partial<SourceRevisionFields> & Pick<SourceRevisionFields, "id">,
): SealedRecord<SourceRevisionFields> {
  return seal("source_revision", {
    sourceId: `fx-source-${overrides.id}`,
    revision: "r1",
    sourceKind: "BAR",
    origin: "FIXTURE",
    subject: "AAPL",
    payloadHash: hashOf(`${overrides.id}:payload`),
    disclosureClass: "PUBLIC",
    publishedAt: "2026-09-18T13:30:00.000Z",
    effectiveAt: "2026-09-18T13:30:00.000Z",
    ingestedAt: "2026-09-18T13:30:05.000Z",
    availableAt: "2026-09-18T13:30:05.000Z",
    correctionAt: null,
    supersedesRevisionId: null,
    ...overrides,
  });
}

export function fixtureEvidenceState(
  fields: Omit<
    EvidenceStateFields,
    "admissionManifestHash" | "normalizedStateHash" | "admissions"
  > & { readonly sources: readonly SealedRecord<SourceRevisionFields>[] },
): SealedRecord<EvidenceStateFields> {
  const { sources, ...rest } = fields;
  const admissions: Admission[] = sources
    .map((source) => ({
      sourceRevisionId: source.id,
      sourceContentHash: source.contentHash,
    }))
    .sort((left, right) =>
      compareCodeUnits(left.sourceRevisionId, right.sourceRevisionId),
    );
  return seal("evidence_state", {
    id: rest.id,
    pack: rest.pack,
    mode: rest.mode,
    subject: rest.subject,
    cutoffAt: rest.cutoffAt,
    admissions,
    admissionManifestHash: admissionManifestHash(admissions),
    normalizedState: rest.normalizedState,
    normalizedStateHash: normalizedStateHash(rest.normalizedState),
    predecessorStateId: rest.predecessorStateId,
    linkKind: rest.linkKind,
    changeSummary: rest.changeSummary,
  });
}

export function fixtureReceipt(
  overrides: Partial<ReceiptObservationFields> &
    Pick<ReceiptObservationFields, "id" | "batchId" | "observation">,
): SealedRecord<ReceiptObservationFields> {
  const receipt = overrides.observation === "SINK_RECEIPT";
  return seal("publication_receipt", {
    rootHash: hashOf(`${overrides.batchId}:root`),
    sinkId: "fixture-sink",
    deadlineAt: "2026-09-18T20:00:00.000Z",
    submittedAt:
      overrides.observation === "MISSING" ? null : "2026-09-18T19:00:00.000Z",
    sinkTimestamp: receipt ? "2026-09-18T19:00:02.000Z" : null,
    proofHash: receipt ? hashOf(`${overrides.id}:proof`) : null,
    failureCode:
      overrides.observation === "SUBMISSION_FAILED" ? "SINK_UNAVAILABLE" : null,
    correctsReceiptId: null,
    ...overrides,
  });
}

// The ordered foundation fixture ------------------------------------------------

export type FixtureOperation =
  | {
      readonly role: "operator";
      readonly method:
        | "appendRegistryEntry"
        | "appendRegistryEvent"
        | "appendCohort"
        | "appendCohortEvent";
      readonly args: readonly [unknown, unknown];
    }
  | {
      readonly role: "worker";
      readonly method:
        | "recordFirstForecastLock"
        | "appendSourceRevision"
        | "appendEvidenceState"
        | "appendPublicationReceipt";
      readonly args: readonly [unknown];
    };

export interface FoundationFixture {
  readonly operations: readonly FixtureOperation[];
  readonly registry: Readonly<
    Record<
      EvidenceLabPack,
      Readonly<Record<RegistrySlot, SealedRecord<RegistryEntryFields>>>
    >
  >;
  readonly cohorts: Readonly<Record<string, SealedRecord<CohortFields>>>;
  readonly sources: Readonly<
    Record<string, SealedRecord<SourceRevisionFields>>
  >;
  readonly states: Readonly<Record<string, SealedRecord<EvidenceStateFields>>>;
  readonly receipts: Readonly<
    Record<string, SealedRecord<ReceiptObservationFields>>
  >;
}

export const FIXTURE_PACKS: readonly EvidenceLabPack[] = [
  "scalping",
  "day",
  "swing",
  "long-term",
];

export function buildFoundationFixture(): FoundationFixture {
  const operations: FixtureOperation[] = [];
  let sequence = 0;
  const nextAudit = (
    command: OperatorCommand,
    target: { id: string; contentHash: string },
  ) => {
    sequence += 1;
    return fixtureAudit(command, target, String(sequence).padStart(4, "0"));
  };
  const operator = (
    method:
      | "appendRegistryEntry"
      | "appendRegistryEvent"
      | "appendCohort"
      | "appendCohortEvent",
    command: OperatorCommand,
    record: SealedRecord<{ id: string }>,
  ) =>
    operations.push({
      role: "operator",
      method,
      args: [record, nextAudit(command, record)],
    });
  const worker = (
    method:
      | "recordFirstForecastLock"
      | "appendSourceRevision"
      | "appendEvidenceState"
      | "appendPublicationReceipt",
    record: unknown,
  ) => operations.push({ role: "worker", method, args: [record] });

  const slots = Object.keys(REGISTRY_SLOTS) as RegistrySlot[];
  const registry = Object.fromEntries(
    FIXTURE_PACKS.map((pack) => [
      pack,
      Object.fromEntries(
        slots.map((slot) => [slot, fixtureRegistryEntry(pack, slot)]),
      ),
    ]),
  ) as Record<
    EvidenceLabPack,
    Record<RegistrySlot, SealedRecord<RegistryEntryFields>>
  >;

  for (const pack of FIXTURE_PACKS) {
    for (const slot of slots) {
      const entry = registry[pack][slot];
      operator("appendRegistryEntry", "APPEND_REGISTRY_ENTRY", entry);
      operator(
        "appendRegistryEvent",
        "APPEND_REGISTRY_EVENT",
        fixtureRegistryEvent(entry.id, "VALIDATED"),
      );
      if (pack === "day") {
        operator(
          "appendRegistryEvent",
          "APPEND_REGISTRY_EVENT",
          fixtureRegistryEvent(entry.id, "APPROVED"),
        );
      }
    }
  }

  // A registry correction: a new version that supersedes, never rewrites.
  const correctedMetric = fixtureRegistryEntry("day", "metric", {
    id: "fx-day-metric-v2",
    version: "fx-day-metric-v2",
    supersedesEntryId: registry.day.metric.id,
    payload: {
      schema: "jev-evidence-lab-metric/v1",
      description: "Fixture metric manifest for day, corrected",
      fixture: true,
    },
  });
  operator("appendRegistryEntry", "APPEND_REGISTRY_ENTRY", correctedMetric);

  const cohorts: Record<string, SealedRecord<CohortFields>> = {};
  for (const pack of FIXTURE_PACKS) {
    const cohort = fixtureCohort(pack, registry[pack]);
    cohorts[cohort.id] = cohort;
    operator("appendCohort", "APPEND_COHORT", cohort);
    operator(
      "appendCohortEvent",
      "APPEND_COHORT_EVENT",
      fixtureCohortEvent(cohort.id, "VALIDATED"),
    );
  }
  const dayCohort = cohorts["fx-cohort-day-v1"] as SealedRecord<CohortFields>;
  const approved = fixtureCohortEvent(dayCohort.id, "APPROVED");
  operator("appendCohortEvent", "APPEND_COHORT_EVENT", approved);
  operator(
    "appendCohortEvent",
    "APPEND_COHORT_EVENT",
    fixtureCohortEvent(dayCohort.id, "ACTIVATION_SCHEDULED"),
  );
  operator(
    "appendCohortEvent",
    "APPEND_COHORT_EVENT",
    fixtureCohortEvent(dayCohort.id, "CORRECTION", {
      correctsEventId: approved.id,
      reason: "Approval reason clarified; methodology unchanged",
    }),
  );

  // A new cohort version for a methodology change; the original is untouched.
  const dayV2 = fixtureCohort(
    "day",
    { ...registry.day, metric: correctedMetric },
    {
      id: "fx-cohort-day-v2",
      cohortVersion: 2,
      predecessorCohortId: dayCohort.id,
    },
  );
  cohorts[dayV2.id] = dayV2;
  operator("appendCohort", "APPEND_COHORT", dayV2);

  const swingCohort = cohorts[
    "fx-cohort-swing-v1"
  ] as SealedRecord<CohortFields>;
  worker(
    "recordFirstForecastLock",
    fixtureForecastLock(swingCohort, "fx-run-swing-0001"),
  );

  // Point-in-time sources, including a restated filing (P2-AE1).
  const sources: Record<string, SealedRecord<SourceRevisionFields>> = {};
  const addSource = (source: SealedRecord<SourceRevisionFields>) => {
    sources[source.id] = source;
    worker("appendSourceRevision", source);
  };
  addSource(
    fixtureSource({
      id: "fx-src-aapl-bar-1330",
      sourceId: "fx-feed:aapl:bar:1330",
    }),
  );
  addSource(
    fixtureSource({
      id: "fx-src-aapl-bar-1430",
      sourceId: "fx-feed:aapl:bar:1430",
      publishedAt: "2026-09-18T14:30:00.000Z",
      effectiveAt: "2026-09-18T14:30:00.000Z",
      ingestedAt: "2026-09-18T14:30:05.000Z",
      availableAt: "2026-09-18T14:30:05.000Z",
    }),
  );
  addSource(
    fixtureSource({
      id: "fx-src-aapl-borrow",
      sourceId: "fx-feed:aapl:borrow",
      sourceKind: "BORROW_AVAILABILITY",
      origin: "SYNTHETIC",
      disclosureClass: "PROTECTED",
      publishedAt: "2026-09-18T12:00:00.000Z",
      effectiveAt: "2026-09-18T12:00:00.000Z",
      ingestedAt: "2026-09-18T12:00:01.000Z",
      availableAt: "2026-09-18T12:00:01.000Z",
    }),
  );
  addSource(
    fixtureSource({
      id: "fx-src-msft-filing-r1",
      sourceId: "fx-filings:msft:10q-q3",
      sourceKind: "FILING",
      subject: "MSFT",
      disclosureClass: "LICENSED",
      publishedAt: "2026-03-01T21:00:00.000Z",
      effectiveAt: "2026-02-28T00:00:00.000Z",
      ingestedAt: "2026-03-01T21:05:00.000Z",
      availableAt: "2026-03-01T21:05:00.000Z",
    }),
  );
  addSource(
    fixtureSource({
      id: "fx-src-msft-filing-r2",
      sourceId: "fx-filings:msft:10q-q3",
      revision: "r2",
      sourceKind: "FILING",
      subject: "MSFT",
      disclosureClass: "LICENSED",
      publishedAt: "2026-06-01T21:00:00.000Z",
      effectiveAt: "2026-02-28T00:00:00.000Z",
      ingestedAt: "2026-06-01T21:05:00.000Z",
      availableAt: "2026-06-01T21:05:00.000Z",
      correctionAt: "2026-06-01T21:00:00.000Z",
      supersedesRevisionId: "fx-src-msft-filing-r1",
    }),
  );

  const states: Record<string, SealedRecord<EvidenceStateFields>> = {};
  const addState = (state: SealedRecord<EvidenceStateFields>) => {
    states[state.id] = state;
    worker("appendEvidenceState", state);
  };
  const dayState = fixtureEvidenceState({
    id: "fx-state-day-aapl-1400",
    pack: "day",
    mode: "fixture",
    subject: "AAPL",
    cutoffAt: "2026-09-18T14:00:00.000Z",
    sources: [
      sources["fx-src-aapl-bar-1330"],
      sources["fx-src-aapl-borrow"],
    ] as SealedRecord<SourceRevisionFields>[],
    normalizedState: { lastClose: 227.5, vwap: 226.9, borrowAvailable: true },
    predecessorStateId: null,
    linkKind: null,
    changeSummary: null,
  });
  addState(dayState);
  addState(
    fixtureEvidenceState({
      id: "fx-state-day-aapl-1400-corrected",
      pack: "day",
      mode: "fixture",
      subject: "AAPL",
      cutoffAt: dayState.cutoffAt,
      sources: [
        sources["fx-src-aapl-bar-1330"],
        sources["fx-src-aapl-borrow"],
      ] as SealedRecord<SourceRevisionFields>[],
      normalizedState: {
        lastClose: 227.5,
        vwap: 226.95,
        borrowAvailable: true,
      },
      predecessorStateId: dayState.id,
      linkKind: "CORRECTION",
      changeSummary: {
        addedSourceRevisionIds: [],
        removedSourceRevisionIds: [],
        reason: "VWAP normalization defect corrected; original state retained",
      },
    }),
  );
  addState(
    fixtureEvidenceState({
      id: "fx-state-day-aapl-1500",
      pack: "day",
      mode: "fixture",
      subject: "AAPL",
      cutoffAt: "2026-09-18T15:00:00.000Z",
      sources: [
        sources["fx-src-aapl-bar-1330"],
        sources["fx-src-aapl-bar-1430"],
        sources["fx-src-aapl-borrow"],
      ] as SealedRecord<SourceRevisionFields>[],
      normalizedState: { lastClose: 228.1, vwap: 227.2, borrowAvailable: true },
      predecessorStateId: dayState.id,
      linkKind: "REASSESSMENT",
      changeSummary: {
        addedSourceRevisionIds: ["fx-src-aapl-bar-1430"],
        removedSourceRevisionIds: [],
        reason: "Scheduled reassessment admits the 14:30 bar",
      },
    }),
  );
  const longTermState = fixtureEvidenceState({
    id: "fx-state-lt-msft-0501",
    pack: "long-term",
    mode: "fixture",
    subject: "MSFT",
    cutoffAt: "2026-05-01T20:00:00.000Z",
    sources: [
      sources["fx-src-msft-filing-r1"],
    ] as SealedRecord<SourceRevisionFields>[],
    normalizedState: { revenueGrowth: 0.12, operatingMargin: 0.41 },
    predecessorStateId: null,
    linkKind: null,
    changeSummary: null,
  });
  addState(longTermState);
  addState(
    fixtureEvidenceState({
      id: "fx-state-lt-msft-0701",
      pack: "long-term",
      mode: "fixture",
      subject: "MSFT",
      cutoffAt: "2026-07-01T20:00:00.000Z",
      sources: [
        sources["fx-src-msft-filing-r2"],
      ] as SealedRecord<SourceRevisionFields>[],
      normalizedState: { revenueGrowth: 0.1, operatingMargin: 0.4 },
      predecessorStateId: longTermState.id,
      linkKind: "REASSESSMENT",
      changeSummary: {
        addedSourceRevisionIds: ["fx-src-msft-filing-r2"],
        removedSourceRevisionIds: ["fx-src-msft-filing-r1"],
        reason: "Restated filing became eligible after the first cutoff",
      },
    }),
  );

  // Receipt observations: none of them grants authority.
  const receipts: Record<string, SealedRecord<ReceiptObservationFields>> = {};
  const addReceipt = (receipt: SealedRecord<ReceiptObservationFields>) => {
    receipts[receipt.id] = receipt;
    worker("appendPublicationReceipt", receipt);
  };
  addReceipt(
    fixtureReceipt({
      id: "fx-receipt-a-1",
      batchId: "fx-batch-a",
      observation: "SINK_RECEIPT",
    }),
  );
  addReceipt(
    fixtureReceipt({
      id: "fx-receipt-b-1",
      batchId: "fx-batch-b",
      observation: "SINK_RECEIPT",
      sinkTimestamp: "2026-09-18T20:00:00.001Z",
    }),
  );
  addReceipt(
    fixtureReceipt({
      id: "fx-receipt-c-1",
      batchId: "fx-batch-c",
      observation: "SUBMISSION_FAILED",
    }),
  );
  addReceipt(
    fixtureReceipt({
      id: "fx-receipt-c-2",
      batchId: "fx-batch-c",
      observation: "SINK_RECEIPT",
      submittedAt: "2026-09-18T20:10:00.000Z",
      sinkTimestamp: "2026-09-18T20:10:03.000Z",
      correctsReceiptId: "fx-receipt-c-1",
    }),
  );
  addReceipt(
    fixtureReceipt({
      id: "fx-receipt-d-1",
      batchId: "fx-batch-d",
      observation: "MISSING",
    }),
  );

  return { operations, registry, cohorts, sources, states, receipts };
}
