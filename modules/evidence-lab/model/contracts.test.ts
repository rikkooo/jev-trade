import { describe, expect, it } from "vitest";

import { buildFoundationFixture, fixturePackProfile } from "../fixtures";
import {
  assertDatabaseCanonical,
  canonicalEnvelope,
  seal,
  verifySeal,
} from "./hashing";
import {
  costScenarioPayloadSchema,
  executionIntents,
  packProfileSchema,
  PACK_VOCABULARY,
} from "./packs";
import {
  armOutputSchema,
  assertEquivalentArmSet,
  assertRunTransition,
  decisionLinkSchema,
  directionalDistributionSchema,
  outcomeContractSchema,
  predictionProvenanceSchema,
  type ArmOutput,
} from "./predictions";
import { PACKS } from "./primitives";
import { receiptObservationFieldsSchema } from "./receipts";
import { cohortFieldsSchema, cohortEventFieldsSchema } from "./cohorts";
import { sourceRevisionFieldsSchema } from "./sources";

const hash = (character: string) => character.repeat(64);

describe("pack profiles", () => {
  it("accepts the complete fixture profile for every pack", () => {
    for (const pack of PACKS) {
      expect(packProfileSchema.parse(fixturePackProfile(pack)).pack).toBe(pack);
    }
  });

  it("rejects a vocabulary, horizon, or execution rule outside the pack contract", () => {
    const day = fixturePackProfile("day");
    const longTerm = fixturePackProfile("long-term");
    const cases: Array<[string, unknown]> = [
      [
        "short stance for long-term",
        { ...longTerm, stances: [...PACK_VOCABULARY.day.stances] },
      ],
      [
        "long-term action for day",
        { ...day, actions: ["BUY", "HOLD", "REDUCE", "EXIT", "WAIT"] },
      ],
      ["reordered actions", { ...day, actions: [...day.actions].reverse() }],
      [
        "short positions for long-term",
        { ...longTerm, positionSides: ["LONG", "SHORT"] },
      ],
      [
        "long-term short selling",
        {
          ...longTerm,
          shortSelling: {
            permitted: true,
            requiresLocate: true,
            unavailableLocate: "FAIL_CLOSED",
            borrowCostModel: "PER_SESSION",
          },
        },
      ],
      ["day without locate", { ...day, shortSelling: { permitted: false } }],
      [
        "5-hour day horizon",
        {
          ...day,
          horizons: [{ id: "300m", kind: "DURATION", seconds: 18_000 }],
        },
      ],
      [
        "ambiguous horizon id",
        { ...day, horizons: [{ id: "1h", kind: "DURATION", seconds: 3_600 }] },
      ],
      [
        "90-day long-term horizon",
        {
          ...longTerm,
          horizons: [{ id: "90d", kind: "CALENDAR_DAYS", days: 90 }],
        },
      ],
      [
        "day without forced close",
        { ...day, session: { forcedCloseBeforeSessionEnd: false } },
      ],
      [
        "missing VWAP",
        { ...day, features: day.features.filter((f) => f !== "VWAP") },
      ],
      [
        "missing adverse scenario",
        { ...day, costs: { ...day.costs, scenarios: ["BASE"] } },
      ],
      [
        "scalping minute timestamps",
        {
          ...fixturePackProfile("scalping"),
          inputs: {
            ...fixturePackProfile("scalping").inputs,
            timestampPrecision: "MINUTE",
          },
        },
      ],
      [
        "missing DCA baseline",
        { ...longTerm, baselines: ["PASSIVE_EXPOSURE", "VALUE_RULE"] },
      ],
      ["unknown field", { ...day, brokerAccount: "x" }],
    ];
    for (const [label, profile] of cases) {
      expect(packProfileSchema.safeParse(profile).success, label).toBe(false);
    }
  });

  it("maps actions to pack-appropriate simulated executions", () => {
    expect(executionIntents("day", "OPEN_SHORT", "FLAT")).toEqual([
      "LOCATE_REQUESTED",
    ]);
    expect(executionIntents("day", "REDUCE", "SHORT")).toEqual([
      "BUY_TO_COVER",
    ]);
    expect(executionIntents("swing", "CLOSE", "LONG")).toEqual([
      "SELL_TO_CLOSE",
    ]);
    expect(executionIntents("long-term", "EXIT", "LONG")).toEqual([
      "SELL_TO_EXIT",
    ]);
    expect(executionIntents("scalping", "WAIT", "FLAT")).toEqual([]);
    expect(() => executionIntents("long-term", "OPEN_SHORT", "FLAT")).toThrow(
      RangeError,
    );
  });

  it("requires adverse costs to be at least the base costs for every component", () => {
    const valid = {
      schema: "jev-evidence-lab-cost-scenarios/v1",
      pack: "long-term",
      units: "BPS_OR_MILLISECONDS",
      base: { FEES: 1, SPREAD: 2, SLIPPAGE: 3 },
      adverse: { FEES: 1, SPREAD: 4, SLIPPAGE: 6 },
      evidenceBasis: "Fixture",
    };
    expect(costScenarioPayloadSchema.safeParse(valid).success).toBe(true);
    expect(
      costScenarioPayloadSchema.safeParse({
        ...valid,
        adverse: { ...valid.adverse, SPREAD: 1 },
      }).success,
    ).toBe(false);
    expect(
      costScenarioPayloadSchema.safeParse({
        ...valid,
        base: { FEES: 1, SPREAD: 2 },
      }).success,
    ).toBe(false);
  });
});

describe("record schemas", () => {
  it("rejects incomplete provenance on every record type", () => {
    const fixture = buildFoundationFixture();
    const source = verifySeal(
      "source_revision",
      fixture.sources["fx-src-aapl-bar-1330"]!,
    );
    for (const field of Object.keys(source)) {
      const incomplete = { ...source } as Record<string, unknown>;
      delete incomplete[field];
      expect(
        sourceRevisionFieldsSchema.safeParse(incomplete).success,
        field,
      ).toBe(false);
    }
    const cohort = verifySeal("cohort", fixture.cohorts["fx-cohort-day-v1"]!);
    const { costScenarios: _dropped, ...partialTuple } = cohort.registryTuple;
    void _dropped;
    expect(
      cohortFieldsSchema.safeParse({ ...cohort, registryTuple: partialTuple })
        .success,
    ).toBe(false);
    expect(
      cohortFieldsSchema.safeParse({
        ...cohort,
        methodology: { ...cohort.methodology, stopRules: [] },
      }).success,
    ).toBe(false);
  });

  it("keeps publication, effective, ingestion, availability, and correction times distinct and ordered", () => {
    const source = verifySeal(
      "source_revision",
      buildFoundationFixture().sources["fx-src-aapl-bar-1330"]!,
    );
    expect(
      sourceRevisionFieldsSchema.safeParse({
        ...source,
        availableAt: "2026-09-18T13:29:59.999Z",
      }).success,
    ).toBe(false);
    expect(
      sourceRevisionFieldsSchema.safeParse({
        ...source,
        correctionAt: "2026-09-18T13:30:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      sourceRevisionFieldsSchema.safeParse({
        ...source,
        publishedAt: "2026-09-18 13:30:00",
      }).success,
    ).toBe(false);
    expect(
      sourceRevisionFieldsSchema.safeParse({ ...source, origin: "LIVE" })
        .success,
    ).toBe(false);
  });

  it("requires a prospective cohort to preregister at least the P2-R45 floor", () => {
    const cohort = verifySeal(
      "cohort",
      buildFoundationFixture().cohorts["fx-cohort-day-v1"]!,
    );
    const prospective = { ...cohort, mode: "prospective" as const };
    expect(cohortFieldsSchema.safeParse(prospective).success).toBe(false);
    expect(
      cohortFieldsSchema.safeParse({
        ...prospective,
        methodology: {
          ...prospective.methodology,
          minimumEvidence: {
            resolvedForecasts: 100,
            symbols: 20,
            resolvedPerHorizon: 20,
            clusters: 20,
          },
        },
      }).success,
    ).toBe(true);
  });

  it("schedules only activations and links only corrections", () => {
    const base = {
      id: "e1",
      cohortId: "c1",
      reason: "Test",
      scheduledEffectiveAt: null,
      correctsEventId: null,
    };
    expect(
      cohortEventFieldsSchema.safeParse({ ...base, eventType: "PAUSED" })
        .success,
    ).toBe(true);
    expect(
      cohortEventFieldsSchema.safeParse({
        ...base,
        eventType: "ACTIVATION_SCHEDULED",
      }).success,
    ).toBe(false);
    expect(
      cohortEventFieldsSchema.safeParse({
        ...base,
        eventType: "PAUSED",
        scheduledEffectiveAt: "2099-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      cohortEventFieldsSchema.safeParse({ ...base, eventType: "CORRECTION" })
        .success,
    ).toBe(false);
    expect(
      cohortEventFieldsSchema.safeParse({
        ...base,
        eventType: "PAUSED",
        reason: "line\nbreak",
      }).success,
    ).toBe(false);
  });

  it("stores the sink's observation shape and never an operator-asserted status", () => {
    const receipt = verifySeal(
      "publication_receipt",
      buildFoundationFixture().receipts["fx-receipt-a-1"]!,
    );
    expect(receiptObservationFieldsSchema.safeParse(receipt).success).toBe(
      true,
    );
    expect(
      receiptObservationFieldsSchema.safeParse({ ...receipt, status: "TIMELY" })
        .success,
    ).toBe(false);
    expect(
      receiptObservationFieldsSchema.safeParse({ ...receipt, proofHash: null })
        .success,
    ).toBe(false);
    expect(
      receiptObservationFieldsSchema.safeParse({
        ...receipt,
        observation: "MISSING",
        sinkTimestamp: "2026-09-18T19:00:02.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("shared prediction contracts", () => {
  const ref = (label: string) => ({
    entryId: `fx-${label}`,
    version: "v1",
    contentHash: hash("a"),
  });
  const downstream = {
    risk: ref("risk"),
    policy: ref("policy"),
    execution: ref("execution"),
    costScenarios: ref("cost"),
  };
  const distribution = { up: 0.5, flat: 0.2, down: 0.3 };
  const arms = (): ArmOutput[] => [
    {
      arm: "standard-tools",
      runId: "run-1",
      pack: "day",
      evidenceStateHash: hash("e"),
      distribution,
      stance: "LONG",
      policy: {
        applicability: "APPLICABLE",
        action: "OPEN_LONG",
        downstream,
        shortAvailability: null,
      },
    },
    {
      arm: "jev",
      runId: "run-1",
      pack: "day",
      evidenceStateHash: hash("e"),
      jevArtifactId: "jev-1",
      distribution,
      stance: "LONG",
      policyApplicability: "NOT_APPLICABLE",
    },
    {
      arm: "full-jev-trade",
      runId: "run-1",
      pack: "day",
      evidenceStateHash: hash("e"),
      jevArtifactId: "jev-1",
      distribution,
      stance: "LONG",
      policy: {
        applicability: "APPLICABLE",
        action: "OPEN_LONG",
        downstream,
        shortAvailability: null,
      },
    },
    {
      arm: "naive-controls",
      runId: "run-1",
      pack: "day",
      evidenceStateHash: hash("e"),
      controlRule: "MAJORITY_CLASS",
      seed: 7,
      distribution: { up: 0, flat: 1, down: 0 },
      policy: null,
    },
  ];

  it("rejects distributions that are not normalized, finite, and closed", () => {
    for (const invalid of [
      { up: 0.9, flat: 0.2, down: 0.1 },
      { up: 0.5, flat: 0.5 },
      { up: -0.1, flat: 0.6, down: 0.5 },
      { up: Number.NaN, flat: 0.5, down: 0.5 },
      { up: 0.5, flat: 0.25, down: 0.25, sideways: 0 },
    ]) {
      expect(directionalDistributionSchema.safeParse(invalid).success).toBe(
        false,
      );
    }
    expect(
      directionalDistributionSchema.safeParse({ up: 0.1, flat: 0.2, down: 0.7 })
        .success,
    ).toBe(true);
  });

  it("classifies the primary comparison and rejects cross-state or policy-bearing Jev arms", () => {
    expect(assertEquivalentArmSet("day", arms())).toEqual({
      policyComparison: "INCREMENTAL_JEV",
    });

    const bundle = arms();
    const full = bundle[2] as Extract<ArmOutput, { arm: "full-jev-trade" }>;
    bundle[2] = {
      ...full,
      policy: {
        ...full.policy,
        downstream: { ...downstream, policy: ref("policy-v2") },
      },
    };
    expect(assertEquivalentArmSet("day", bundle)).toEqual({
      policyComparison: "PRODUCT_BUNDLE",
    });

    const crossState = arms();
    crossState[1] = {
      ...(crossState[1] as ArmOutput),
      evidenceStateHash: hash("f"),
    };
    expect(() => assertEquivalentArmSet("day", crossState)).toThrow(
      /same evidence state/,
    );

    const secondCall = arms();
    secondCall[2] = { ...full, jevArtifactId: "jev-2" };
    expect(() => assertEquivalentArmSet("day", secondCall)).toThrow(
      /one Jev artifact/,
    );

    expect(
      armOutputSchema.safeParse({
        ...(arms()[1] as ArmOutput),
        policy: arms()[0] && (arms()[0] as { policy: unknown }).policy,
      }).success,
    ).toBe(false);
    expect(() => assertEquivalentArmSet("day", arms().slice(0, 3))).toThrow(
      /four arms/,
    );
  });

  it("rejects stances and actions outside the pack and shorts without a locate", () => {
    const [standard] = arms() as [
      Extract<ArmOutput, { arm: "standard-tools" }>,
    ];
    expect(
      armOutputSchema.safeParse({ ...standard, stance: "ACCUMULATE" }).success,
    ).toBe(false);
    expect(
      armOutputSchema.safeParse({
        ...standard,
        pack: "long-term",
        stance: "ACCUMULATE",
      }).success,
    ).toBe(false);
    const short = {
      ...standard,
      stance: "SHORT",
      policy: { ...standard.policy, action: "OPEN_SHORT" },
    };
    expect(armOutputSchema.safeParse(short).success).toBe(false);
    expect(
      armOutputSchema.safeParse({
        ...short,
        policy: {
          ...short.policy,
          shortAvailability: {
            status: "LOCATED",
            locateSourceRevisionId: "fx-src-aapl-borrow",
            borrowRateBps: 25,
          },
        },
      }).success,
    ).toBe(true);
  });

  it("requires full version and eligible-source provenance on a prediction", () => {
    const versions = Object.fromEntries(
      [
        "packProfile",
        "feature",
        "prompt",
        "model",
        "risk",
        "policy",
        "execution",
        "costScenarios",
        "outcome",
        "baseline",
        "metric",
      ].map((slot) => [slot, ref(slot)]),
    );
    const source = {
      sourceRevisionId: "fx-src-aapl-bar-1330",
      contentHash: hash("b"),
      publishedAt: "2026-09-18T13:30:00.000Z",
      effectiveAt: "2026-09-18T13:30:00.000Z",
      ingestedAt: "2026-09-18T13:30:05.000Z",
      availableAt: "2026-09-18T13:30:05.000Z",
      correctionAt: null,
    };
    const provenance = {
      schema: "jev-evidence-lab-prediction-provenance/v1",
      pack: "day",
      mode: "fixture",
      horizon: "15m",
      subject: "AAPL",
      cohortId: "fx-cohort-day-v1",
      cohortContentHash: hash("c"),
      registryRootHash: hash("d"),
      cutoffAt: "2026-09-18T14:00:00.000Z",
      frozenAt: "2026-09-18T14:00:01.000Z",
      evidenceStateId: "fx-state-day-aapl-1400",
      evidenceStateHash: hash("e"),
      admissionManifestHash: hash("f"),
      normalizedStateHash: hash("1"),
      sources: [source],
      versions: {
        ...versions,
        api: "research-v2",
        build: "c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9",
      },
    };
    expect(predictionProvenanceSchema.safeParse(provenance).success).toBe(true);
    for (const missing of ["risk", "api", "build", "prompt"]) {
      const versionsWithout = { ...provenance.versions } as Record<
        string,
        unknown
      >;
      delete versionsWithout[missing];
      expect(
        predictionProvenanceSchema.safeParse({
          ...provenance,
          versions: versionsWithout,
        }).success,
        missing,
      ).toBe(false);
    }
    expect(
      predictionProvenanceSchema.safeParse({
        ...provenance,
        sources: [{ ...source, availableAt: "2026-09-18T14:00:00.001Z" }],
      }).success,
    ).toBe(false);
    expect(
      predictionProvenanceSchema.safeParse({
        ...provenance,
        mode: "prospective",
        sources: [{ ...source, ingestedAt: "2026-09-18T14:05:00.000Z" }],
      }).success,
    ).toBe(false);
    expect(
      predictionProvenanceSchema.safeParse({
        ...provenance,
        frozenAt: "2026-09-18T13:59:59.000Z",
      }).success,
    ).toBe(false);
  });

  it("forbids post-outcome repair and enforces the run and outcome lifecycles", () => {
    const repair = {
      kind: "REPAIR",
      predecessorId: "a",
      successorId: "b",
      reason: "Late model response",
      repairedAt: "2026-09-18T15:00:00.000Z",
      earliestOutcomeObservableAt: "2026-09-18T15:00:00.000Z",
    };
    expect(decisionLinkSchema.safeParse(repair).success).toBe(false);
    expect(
      decisionLinkSchema.safeParse({
        ...repair,
        repairedAt: "2026-09-18T14:59:59.999Z",
      }).success,
    ).toBe(true);

    expect(() => assertRunTransition("queued", "evaluating")).not.toThrow();
    expect(() => assertRunTransition("published", "failed")).toThrow(
      /illegal run transition/,
    );
    expect(() => assertRunTransition("resolved", "resolving")).toThrow(
      /illegal run transition/,
    );

    const outcome = {
      id: "o1",
      runId: "run-1",
      horizon: "15m",
      state: "RESOLVED",
      rule: ref("outcome"),
      horizonEndsAt: "2026-09-18T14:15:00.000Z",
      observation: {
        sourceRevisionId: "s1",
        observedAt: "2026-09-18T14:14:59.000Z",
      },
      voidReason: null,
      correctsOutcomeId: null,
    };
    expect(outcomeContractSchema.safeParse(outcome).success).toBe(false);
    expect(
      outcomeContractSchema.safeParse({
        ...outcome,
        state: "VOID",
        observation: null,
        voidReason: "Halted",
      }).success,
    ).toBe(true);
  });
});

describe("canonical hashing", () => {
  it("seals deterministically and detects any tampered field", () => {
    const record = seal("registry_event", {
      id: "fx-event",
      registryEntryId: "fx-entry",
      eventType: "VALIDATED",
      reason: "Deterministic",
      reviewReference: null,
    });
    expect(record.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      seal("registry_event", verifySeal("registry_event", record)),
    ).toEqual(record);
    expect(() =>
      verifySeal("registry_event", { ...record, reason: "Changed" }),
    ).toThrow(/canonical payload/);
    expect(() =>
      verifySeal("registry_event", { ...record, contentHash: hash("0") }),
    ).toThrow(/content hash/);
    expect(() => verifySeal("cohort_event", record)).toThrow(
      /canonical payload/,
    );
  });

  it("refuses values PostgreSQL would serialize differently", () => {
    for (const value of [1e-7, 1e21, "a\u0000b", "\ud800", { ["💡"]: 1 }]) {
      expect(() => assertDatabaseCanonical(value)).toThrow();
    }
    expect(() =>
      assertDatabaseCanonical({ price: 0.000001, label: "💡 é" }),
    ).not.toThrow();
    expect(canonicalEnvelope("registry_event", { b: 1, a: [2, 1] })).toBe(
      '{"kind":"registry_event","payload":{"a":[2,1],"b":1},"recipe":"jev-evidence-lab-canonical-json/v1"}',
    );
  });

  it("orders keys by code unit, never by locale collation", () => {
    const payload = { é: 1, e: 2, Z: 3, z: 4, ß: 5 };
    const before = canonicalEnvelope("registry_event", payload);
    // A locale-aware sort (the #31 defect) would place "é" beside "e".
    expect(before).toContain('"Z":3,"e":2,"z":4,"ß":5,"é":1');
  });
});
