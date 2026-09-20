import { describe, expect, it } from "vitest";

import {
  computeEvidenceLabContentHash,
  futureArmOutputSchema,
  futureOutcomeSchema,
  futureRunSchema,
  packProfileSchema,
  publicationReceiptSchema,
  safeEvidenceProjection,
  sourceRevisionSchema,
  stanceForPackSchema,
  versionTupleSchema,
} from "./contracts";
import {
  makeFixtureEvidenceState,
  makeFixturePublicationReceipt,
  makeFixtureSourceRevision,
} from "./fixtures";

describe("Evidence Lab contracts", () => {
  it("accepts all four fixture-safe pack profiles and only their action vocabularies", () => {
    for (const pack of ["scalping", "day", "swing", "long-term"] as const) {
      expect(packProfileSchema.parse({ pack, version: "v1" }).pack).toBe(pack);
    }

    expect(stanceForPackSchema("scalping").parse("LONG")).toBe("LONG");
    expect(stanceForPackSchema("day").parse("SHORT")).toBe("SHORT");
    expect(stanceForPackSchema("swing").parse("WAIT")).toBe("WAIT");
    expect(stanceForPackSchema("long-term").parse("ACCUMULATE")).toBe(
      "ACCUMULATE",
    );
    expect(() => stanceForPackSchema("long-term").parse("SHORT")).toThrow();
  });

  it("rejects invalid normalized distributions and unpermitted actions", () => {
    expect(() =>
      futureArmOutputSchema.parse({
        id: "arm_01",
        runId: "run_01",
        pack: "day",
        arm: "jev",
        evidenceStateHash: "a".repeat(64),
        policyApplicability: "NOT_APPLICABLE",
        distribution: { up: 0.9, flat: 0.2, down: 0.1 },
        stance: "LONG",
      }),
    ).toThrow();

    expect(() =>
      futureArmOutputSchema.parse({
        id: "arm_01",
        runId: "run_01",
        pack: "day",
        arm: "jev",
        evidenceStateHash: "a".repeat(64),
        policyApplicability: "NOT_APPLICABLE",
        distribution: { up: 0.5, flat: 0.2, down: 0.3 },
        stance: "LONG",
        action: "OPEN_LONG",
      }),
    ).toThrow();

    expect(() =>
      futureArmOutputSchema.parse({
        id: "arm_02",
        runId: "run_01",
        pack: "long-term",
        arm: "full-jev-trade",
        evidenceStateHash: "a".repeat(64),
        policyApplicability: "APPLICABLE",
        distribution: { up: 0.5, flat: 0.2, down: 0.3 },
        stance: "LONG",
        action: "OPEN_LONG",
      }),
    ).toThrow();
  });

  it("uses one stable canonical content hash regardless of key order", () => {
    const left = computeEvidenceLabContentHash("registry_entry", {
      alpha: 1,
      beta: { z: true, a: false },
    });
    const right = computeEvidenceLabContentHash("registry_entry", {
      beta: { a: false, z: true },
      alpha: 1,
    });

    expect(left).toEqual(right);
    expect(left.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps point-in-time fields distinct and rejects a missing source revision hash", () => {
    const source = makeFixtureSourceRevision();
    expect(sourceRevisionSchema.parse(source)).toMatchObject({
      publishedAt: "2026-09-20T08:00:00.000Z",
      effectiveAt: "2026-09-20T08:01:00.000Z",
      ingestedAt: "2026-09-20T08:02:00.000Z",
      availableAt: "2026-09-20T08:03:00.000Z",
    });
    expect(() =>
      sourceRevisionSchema.parse({ ...source, sourceHash: "not-a-hash" }),
    ).toThrow();
  });

  it("requires a timely receipt that binds the publication root", () => {
    expect(
      publicationReceiptSchema.parse(makeFixturePublicationReceipt()),
    ).toMatchObject({
      status: "TIMELY",
    });
    expect(() =>
      publicationReceiptSchema.parse(
        makeFixturePublicationReceipt({
          receivedAt: "2026-09-20T10:01:00.000Z",
        }),
      ),
    ).toThrow();
  });

  it("requires version boundaries for future run, arm, and outcome interfaces", () => {
    const tuple = versionTupleSchema.parse({
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
    });
    expect(
      futureRunSchema.parse({
        id: "run_01",
        cohortId: "cohort_01",
        evidenceStateHash: makeFixtureEvidenceState().contentHash,
        cutoffAt: "2026-09-20T09:00:00.000Z",
        mode: "fixture",
        versions: tuple,
      }).versions,
    ).toEqual(tuple);
    expect(
      futureOutcomeSchema.parse({
        id: "outcome_01",
        runId: "run_01",
        state: "UNRESOLVED",
        ruleVersion: "outcome-v1",
      }).state,
    ).toBe("UNRESOLVED");
  });

  it("redacts secrets, protected prompts, licensed payloads, credentials, and headers", () => {
    expect(
      safeEvidenceProjection({
        id: "evidence_01",
        sourceHash: "a".repeat(64),
        rawLicensedPayload: { close: 123 },
        protectedPrompt: "do not expose",
        requestHeaders: { authorization: "Bearer secret" },
        nested: { apiKey: "secret", retained: "safe" },
      }),
    ).toEqual({
      id: "evidence_01",
      sourceHash: "a".repeat(64),
      nested: { retained: "safe" },
    });
  });
});
