import { describe, expect, it } from "vitest";

import { EvidenceLabError } from "../errors";
import {
  buildFoundationFixture,
  fixtureAudit,
  fixtureCohort,
  fixtureCohortEvent,
  fixtureEvidenceState,
  fixtureForecastLock,
  fixtureReceipt,
  fixtureRegistryEntry,
  fixtureRegistryEvent,
  fixtureSource,
  type FixtureOperation,
} from "../fixtures";
import { seal, type SealedRecord } from "../model/hashing";
import type { SourceRevisionFields } from "../model/sources";
import { InMemoryEvidenceLabLedger } from "./ledger";

const FIXED_NOW = new Date("2026-09-20T12:00:00.000Z");

function apply(ledger: InMemoryEvidenceLabLedger, operation: FixtureOperation) {
  const method = ledger[operation.method].bind(ledger) as (
    ...args: readonly unknown[]
  ) => { created: boolean; id: string };
  return method(...operation.args);
}

function loadedLedger(clock = () => FIXED_NOW) {
  const fixture = buildFoundationFixture();
  const ledger = new InMemoryEvidenceLabLedger({ clock });
  for (const operation of fixture.operations) apply(ledger, operation);
  return { fixture, ledger };
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("fixture record is missing");
  return value;
}

function expectCode(action: () => unknown, code: EvidenceLabError["code"]) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(EvidenceLabError);
    expect((error as EvidenceLabError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe("InMemoryEvidenceLabLedger", () => {
  it("replays the whole foundation fixture and treats an identical retry as a no-op", () => {
    const { fixture, ledger } = loadedLedger();
    const before = ledger.contentHashes();
    for (const operation of fixture.operations) {
      expect(apply(ledger, operation).created).toBe(false);
    }
    expect(ledger.contentHashes()).toEqual(before);
  });

  it("rejects a different payload under an existing id or version label", () => {
    const { fixture, ledger } = loadedLedger();
    const original = fixture.registry.day.feature;
    const changed = fixtureRegistryEntry("day", "feature", {
      payload: {
        schema: "jev-evidence-lab-feature/v1",
        description: "changed",
      },
    });
    expectCode(
      () =>
        ledger.appendRegistryEntry(
          changed,
          fixtureAudit("APPEND_REGISTRY_ENTRY", changed, "9001"),
        ),
      "CONFLICT",
    );
    const sameLabel = fixtureRegistryEntry("day", "feature", {
      id: "fx-day-feature-other",
      payload: { schema: "jev-evidence-lab-feature/v1", description: "other" },
    });
    expectCode(
      () =>
        ledger.appendRegistryEntry(
          sameLabel,
          fixtureAudit("APPEND_REGISTRY_ENTRY", sameLabel, "9002"),
        ),
      "CONFLICT",
    );
    expect(ledger.registryEntry(original.id)).toEqual(original);
  });

  it("binds each accepted command to one idempotency key and one exact request", () => {
    const { fixture, ledger } = loadedLedger();
    const entry = fixtureRegistryEntry("swing", "metric", {
      id: "fx-swing-metric-v2",
      version: "fx-swing-metric-v2",
      supersedesEntryId: fixture.registry.swing.metric.id,
    });
    const reusedKey = fixtureAudit("APPEND_REGISTRY_ENTRY", entry, "9003", {
      idempotencyKey: "fx-idempotency-0001",
    });
    expectCode(() => ledger.appendRegistryEntry(entry, reusedKey), "CONFLICT");

    const wrongTarget = fixtureAudit(
      "APPEND_REGISTRY_ENTRY",
      { id: entry.id, contentHash: "0".repeat(64) },
      "9004",
    );
    expectCode(
      () => ledger.appendRegistryEntry(entry, wrongTarget),
      "VALIDATION",
    );

    const audit = fixtureAudit("APPEND_REGISTRY_ENTRY", entry, "9005");
    expect(ledger.appendRegistryEntry(entry, audit).created).toBe(true);
    expect(ledger.appendRegistryEntry(entry, audit).created).toBe(false);
    const otherKey = fixtureAudit("APPEND_REGISTRY_ENTRY", entry, "9006");
    expectCode(() => ledger.appendRegistryEntry(entry, otherKey), "CONFLICT");
  });

  it("enforces the registry lifecycle and requires a review reference to approve", () => {
    const { fixture, ledger } = loadedLedger();
    const entry = fixture.registry.swing.feature;
    const again = fixtureRegistryEvent(entry.id, "VALIDATED");
    const replayAudit = fixtureAudit("APPEND_REGISTRY_EVENT", again, "9101");
    expectCode(
      () => ledger.appendRegistryEvent(again, replayAudit),
      "CONFLICT",
    );

    const retired = fixtureRegistryEvent(entry.id, "RETIRED");
    ledger.appendRegistryEvent(
      retired,
      fixtureAudit("APPEND_REGISTRY_EVENT", retired, "9102"),
    );
    expect(ledger.registryEntryStatus(entry.id)).toBe("RETIRED");
    const approve = seal("registry_event", {
      id: `${entry.id}-late-approval`,
      registryEntryId: entry.id,
      eventType: "APPROVED" as const,
      reason: "Approval after retirement",
      reviewReference: "fixture-only:not-a-review",
    });
    expectCode(
      () =>
        ledger.appendRegistryEvent(
          approve,
          fixtureAudit("APPEND_REGISTRY_EVENT", approve, "9103"),
        ),
      "ILLEGAL_TRANSITION",
    );
    const unreviewed = seal("registry_event", {
      id: "fx-unreviewed",
      registryEntryId: fixture.registry.scalping.feature.id,
      eventType: "APPROVED" as const,
      reason: "No review",
      reviewReference: null,
    });
    expectCode(
      () =>
        ledger.appendRegistryEvent(
          unreviewed,
          fixtureAudit("APPEND_REGISTRY_EVENT", unreviewed, "9104"),
        ),
      "VALIDATION",
    );
  });

  it("keeps a cohort immutable, versions changes, and locks its first forecast once", () => {
    const { fixture, ledger } = loadedLedger();
    const swing = must(fixture.cohorts["fx-cohort-swing-v1"]);
    expect(ledger.firstForecastLock(swing.id)?.firstForecastRef).toBe(
      "fx-run-swing-0001",
    );
    const moved = fixtureForecastLock(swing, "fx-run-swing-0002");
    expectCode(
      () => ledger.recordFirstForecastLock(moved),
      "ILLEGAL_TRANSITION",
    );
    expect(
      ledger.recordFirstForecastLock(
        fixtureForecastLock(swing, "fx-run-swing-0001"),
      ).created,
    ).toBe(false);
    expect(Object.isFrozen(ledger.cohort(swing.id))).toBe(true);
    expect(() => {
      (ledger.cohort(swing.id)?.methodology.horizons as string[]).push(
        "15-sessions",
      );
    }).toThrow(TypeError);

    const v2 = fixture.cohorts["fx-cohort-day-v2"];
    expect(v2?.predecessorCohortId).toBe("fx-cohort-day-v1");
    expect(ledger.cohort("fx-cohort-day-v1")).toEqual(
      fixture.cohorts["fx-cohort-day-v1"],
    );
    const forked = fixtureCohort("day", fixture.registry.day, {
      id: "fx-cohort-day-v2-fork",
      cohortVersion: 2,
      predecessorCohortId: "fx-cohort-day-v1",
    });
    expectCode(
      () =>
        ledger.appendCohort(
          forked,
          fixtureAudit("APPEND_COHORT", forked, "9201"),
        ),
      "CONFLICT",
    );
    const retagged = fixtureCohort("day", fixture.registry.day, {
      id: "fx-cohort-day-v3-replay",
      mode: "replay",
      cohortVersion: 3,
      predecessorCohortId: "fx-cohort-day-v2",
    });
    expectCode(
      () =>
        ledger.appendCohort(
          retagged,
          fixtureAudit("APPEND_COHORT", retagged, "9202"),
        ),
      "VALIDATION",
    );
  });

  it("rejects illegal cohort transitions, backdated activation, and cross-pack references", () => {
    const { fixture, ledger } = loadedLedger();
    const scalping = fixture.cohorts["fx-cohort-scalping-v1"];
    const activate = fixtureCohortEvent(
      scalping?.id ?? "",
      "ACTIVATION_SCHEDULED",
    );
    expectCode(
      () =>
        ledger.appendCohortEvent(
          activate,
          fixtureAudit("APPEND_COHORT_EVENT", activate, "9301"),
        ),
      "ILLEGAL_TRANSITION",
    );
    const day = fixture.cohorts["fx-cohort-day-v1"];
    expect(ledger.cohortStatus(day?.id ?? "")).toBe("ACTIVATION_PENDING");
    const paused = fixtureCohortEvent(day?.id ?? "", "PAUSED");
    ledger.appendCohortEvent(
      paused,
      fixtureAudit("APPEND_COHORT_EVENT", paused, "9302"),
    );
    const backdated = fixtureCohortEvent(
      day?.id ?? "",
      "ACTIVATION_SCHEDULED",
      {
        id: "fx-day-backdated-activation",
        scheduledEffectiveAt: "2026-09-19T00:00:00.000Z",
      },
    );
    expectCode(
      () =>
        ledger.appendCohortEvent(
          backdated,
          fixtureAudit("APPEND_COHORT_EVENT", backdated, "9303"),
        ),
      "VALIDATION",
    );
    const mixed = fixtureCohort(
      "swing",
      { ...fixture.registry.swing, feature: fixture.registry.day.feature },
      {
        id: "fx-cohort-mixed",
      },
    );
    expectCode(
      () =>
        ledger.appendCohort(
          mixed,
          fixtureAudit("APPEND_COHORT", mixed, "9304"),
        ),
      "VALIDATION",
    );
  });

  it("holds prospective activation and prospective evidence closed", () => {
    const { fixture, ledger } = loadedLedger();
    const prospective = fixtureCohort("day", fixture.registry.day, {
      id: "fx-cohort-day-prospective",
      mode: "prospective",
    });
    ledger.appendCohort(
      prospective,
      fixtureAudit("APPEND_COHORT", prospective, "9401"),
    );
    const validated = fixtureCohortEvent(prospective.id, "VALIDATED");
    ledger.appendCohortEvent(
      validated,
      fixtureAudit("APPEND_COHORT_EVENT", validated, "9402"),
    );
    const approved = fixtureCohortEvent(prospective.id, "APPROVED");
    expectCode(
      () =>
        ledger.appendCohortEvent(
          approved,
          fixtureAudit("APPEND_COHORT_EVENT", approved, "9403"),
        ),
      "ILLEGAL_TRANSITION",
    );
    const lock = fixtureForecastLock(prospective, "fx-run-prospective-0001");
    expectCode(
      () => ledger.recordFirstForecastLock(lock),
      "ILLEGAL_TRANSITION",
    );

    const bar = fixture.sources[
      "fx-src-aapl-bar-1330"
    ] as SealedRecord<SourceRevisionFields>;
    const state = fixtureEvidenceState({
      id: "fx-state-prospective",
      pack: "day",
      mode: "prospective",
      subject: "AAPL",
      cutoffAt: "2026-09-18T14:00:00.000Z",
      sources: [bar],
      normalizedState: { lastClose: 1 },
      predecessorStateId: null,
      linkKind: null,
      changeSummary: null,
    });
    expectCode(() => ledger.appendEvidenceState(state), "GATED");
  });

  it("admits only sources available and not yet superseded at the cutoff", () => {
    const { fixture, ledger } = loadedLedger();
    const late = fixture.sources[
      "fx-src-aapl-bar-1430"
    ] as SealedRecord<SourceRevisionFields>;
    const early = fixtureEvidenceState({
      id: "fx-state-leak",
      pack: "day",
      mode: "fixture",
      subject: "AAPL",
      cutoffAt: "2026-09-18T14:00:00.000Z",
      sources: [late],
      normalizedState: { lastClose: 1 },
      predecessorStateId: null,
      linkKind: null,
      changeSummary: null,
    });
    expectCode(() => ledger.appendEvidenceState(early), "VALIDATION");

    const restated = fixture.sources[
      "fx-src-msft-filing-r1"
    ] as SealedRecord<SourceRevisionFields>;
    const stale = fixtureEvidenceState({
      id: "fx-state-stale-filing",
      pack: "long-term",
      mode: "fixture",
      subject: "MSFT",
      cutoffAt: "2026-07-01T20:00:00.000Z",
      sources: [restated],
      normalizedState: { revenueGrowth: 0.12 },
      predecessorStateId: null,
      linkKind: null,
      changeSummary: null,
    });
    expectCode(() => ledger.appendEvidenceState(stale), "VALIDATION");

    // P2-AE1: the original filing stays eligible for the earlier cutoff.
    expect(
      ledger
        .sourceRevisionsAsOf(
          "fx-filings:msft:10q-q3",
          "2026-05-01T20:00:00.000Z",
        )
        .map(({ source, eligible }) => [source.id, eligible]),
    ).toEqual([
      ["fx-src-msft-filing-r1", true],
      ["fx-src-msft-filing-r2", false],
    ]);
  });

  it("appends corrections and reassessments without changing the original state", () => {
    const { fixture, ledger } = loadedLedger();
    const original = fixture.states["fx-state-day-aapl-1400"];
    expect(ledger.evidenceState("fx-state-day-aapl-1400")).toEqual(original);
    expect(
      ledger.evidenceState("fx-state-day-aapl-1500")?.predecessorStateId,
    ).toBe(original?.id);
    expect(
      ledger.evidenceState("fx-state-day-aapl-1400-corrected")?.linkKind,
    ).toBe("CORRECTION");

    const second = fixtureEvidenceState({
      id: "fx-state-day-second-reassessment",
      pack: "day",
      mode: "fixture",
      subject: "AAPL",
      cutoffAt: "2026-09-18T16:00:00.000Z",
      sources: [
        fixture.sources[
          "fx-src-aapl-bar-1330"
        ] as SealedRecord<SourceRevisionFields>,
      ],
      normalizedState: { lastClose: 2 },
      predecessorStateId: original?.id ?? null,
      linkKind: "REASSESSMENT",
      changeSummary: {
        addedSourceRevisionIds: [],
        removedSourceRevisionIds: ["fx-src-aapl-borrow"],
        reason: "Second successor",
      },
    });
    expectCode(() => ledger.appendEvidenceState(second), "CONFLICT");

    const understated = fixtureEvidenceState({
      id: "fx-state-day-understated",
      pack: "day",
      mode: "fixture",
      subject: "AAPL",
      cutoffAt: "2026-09-18T16:00:00.000Z",
      sources: [
        fixture.sources["fx-src-aapl-bar-1330"],
        fixture.sources["fx-src-aapl-bar-1430"],
      ] as SealedRecord<SourceRevisionFields>[],
      normalizedState: { lastClose: 2 },
      predecessorStateId: "fx-state-day-aapl-1500",
      linkKind: "REASSESSMENT",
      changeSummary: {
        addedSourceRevisionIds: [],
        removedSourceRevisionIds: [],
        reason: "Claims nothing changed",
      },
    });
    expectCode(() => ledger.appendEvidenceState(understated), "VALIDATION");
  });

  it("keeps source corrections linked to a single predecessor of the same identity", () => {
    const { ledger } = loadedLedger();
    const hijack = fixtureSource({
      id: "fx-src-hijack",
      sourceId: "fx-feed:other",
      correctionAt: "2026-06-02T00:00:00.000Z",
      availableAt: "2026-06-02T00:00:00.000Z",
      publishedAt: "2026-06-02T00:00:00.000Z",
      supersedesRevisionId: "fx-src-msft-filing-r1",
    });
    expectCode(() => ledger.appendSourceRevision(hijack), "CONFLICT");
    const identity = fixtureSource({
      id: "fx-src-identity",
      sourceId: "fx-feed:other",
      correctionAt: "2026-09-18T15:00:00.000Z",
      availableAt: "2026-09-18T15:00:00.000Z",
      publishedAt: "2026-09-18T15:00:00.000Z",
      supersedesRevisionId: "fx-src-aapl-bar-1430",
    });
    expectCode(() => ledger.appendSourceRevision(identity), "VALIDATION");
  });

  it("stores late, missing, and failed receipts without granting authority", () => {
    const { fixture, ledger } = loadedLedger();
    const statuses = Object.keys(fixture.receipts).map((id) => [
      id,
      ledger.claimedReceiptStatus(id),
    ]);
    expect(statuses).toEqual([
      ["fx-receipt-a-1", "TIMELY"],
      ["fx-receipt-b-1", "LATE"],
      ["fx-receipt-c-1", "FAILED"],
      ["fx-receipt-c-2", "LATE"],
      ["fx-receipt-d-1", "MISSING"],
    ]);
    for (const batch of ["a", "b", "c", "d"]) {
      const receipt = fixture.receipts[`fx-receipt-${batch}-1`];
      const authority = ledger.receiptAuthority(
        `fx-batch-${batch}`,
        receipt?.rootHash ?? "",
      );
      expect(authority.authoritative).toBe(false);
      expect(authority.blockers).toContain(
        "INDEPENDENT_SINK_VERIFICATION_UNAVAILABLE",
      );
    }
    expect(
      ledger.receiptAuthority(
        "fx-batch-c",
        fixture.receipts["fx-receipt-c-1"]?.rootHash ?? "",
      ).blockers,
    ).toEqual(["RECEIPT_LATE", "INDEPENDENT_SINK_VERIFICATION_UNAVAILABLE"]);
  });

  it("refuses self-asserted, early-missing, unlinked, and re-rooted receipts", () => {
    const { ledger } = loadedLedger();
    const selfAsserted = {
      ...fixtureReceipt({
        id: "fx-r-self",
        batchId: "fx-batch-e",
        observation: "SINK_RECEIPT",
      }),
      status: "TIMELY",
    };
    expectCode(
      () => ledger.appendPublicationReceipt(selfAsserted),
      "VALIDATION",
    );

    const early = new InMemoryEvidenceLabLedger({
      clock: () => new Date("2026-09-18T19:30:00.000Z"),
    });
    expectCode(
      () =>
        early.appendPublicationReceipt(
          fixtureReceipt({
            id: "fx-r-early",
            batchId: "fx-batch-f",
            observation: "MISSING",
          }),
        ),
      "VALIDATION",
    );

    const unlinked = fixtureReceipt({
      id: "fx-r-unlinked",
      batchId: "fx-batch-a",
      observation: "SINK_RECEIPT",
    });
    expectCode(() => ledger.appendPublicationReceipt(unlinked), "VALIDATION");
    const rerooted = fixtureReceipt({
      id: "fx-r-rerooted",
      batchId: "fx-batch-a",
      observation: "SINK_RECEIPT",
      rootHash: "f".repeat(64),
      correctsReceiptId: "fx-receipt-a-1",
    });
    expectCode(() => ledger.appendPublicationReceipt(rerooted), "VALIDATION");
  });

  it("records a rejected command without its effect", () => {
    const { ledger } = loadedLedger();
    const target = { id: "fx-never-created", contentHash: "1".repeat(64) };
    const rejected = fixtureAudit("APPEND_COHORT", target, "9501", {
      outcome: "REJECTED",
      rejectionCode: "ILLEGAL_TRANSITION",
    });
    expect(ledger.appendRejectedOperatorCommand(rejected).created).toBe(true);
    expect(ledger.cohort("fx-never-created")).toBeUndefined();
    const accepted = fixtureAudit("APPEND_COHORT", target, "9502");
    expectCode(
      () => ledger.appendRejectedOperatorCommand(accepted),
      "VALIDATION",
    );
  });
});
