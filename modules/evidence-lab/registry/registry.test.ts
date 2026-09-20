import { describe, expect, it } from "vitest";

import {
  makeFixtureCohort,
  makeFixtureCohortEvent,
  makeFixtureEvidenceState,
  makeFixturePublicationReceipt,
  makeFixtureRegistryEntry,
  makeFixtureSourceRevision,
} from "../fixtures";
import { FixtureEvidenceRegistry } from "./registry";

function registry() {
  return new FixtureEvidenceRegistry({
    now: () => new Date("2026-09-20T09:00:00.000Z"),
  });
}

describe("FixtureEvidenceRegistry", () => {
  it("preserves correction links without mutating the original revision", () => {
    const store = registry();
    const original = store.appendSourceRevision(makeFixtureSourceRevision());
    const correction = store.appendSourceRevision(
      makeFixtureSourceRevision({
        id: "source_02",
        revision: "v2",
        supersedesSourceRevisionId: original.id,
        correctionAt: "2026-09-20T09:10:00.000Z",
      }),
    );

    expect(store.sourceRevision(original.id)).toEqual(original);
    expect(correction.supersedesSourceRevisionId).toBe(original.id);
    expect(store.sourceRevisions()).toHaveLength(2);
  });

  it("rejects a correction that changes source identity or a dangling predecessor", () => {
    const store = registry();
    const original = store.appendSourceRevision(makeFixtureSourceRevision());

    expect(() =>
      store.appendSourceRevision(
        makeFixtureSourceRevision({
          id: "source_wrong_identity",
          revision: "v2",
          sourceId: "fixture:day:MSFT",
          supersedesSourceRevisionId: original.id,
          correctionAt: "2026-09-20T09:10:00.000Z",
        }),
      ),
    ).toThrow("retain source identity");
    expect(() =>
      store.appendSourceRevision(
        makeFixtureSourceRevision({
          id: "source_orphan",
          revision: "v3",
          supersedesSourceRevisionId: "unknown_source",
          correctionAt: "2026-09-20T09:10:00.000Z",
        }),
      ),
    ).toThrow("unknown source revision");
  });

  it("rejects source admission after an evidence state's cutoff", () => {
    const store = registry();
    const source = store.appendSourceRevision(
      makeFixtureSourceRevision({ availableAt: "2026-09-20T09:00:00.001Z" }),
    );

    expect(() =>
      store.appendEvidenceState(
        makeFixtureEvidenceState({
          sourceRevisionIds: [source.id],
          cutoffAt: "2026-09-20T09:00:00.000Z",
        }),
      ),
    ).toThrow("available after the evidence cutoff");
  });

  it("locks a cohort's methodology after its first forecast", () => {
    const store = registry();
    const cohort = store.appendCohort(makeFixtureCohort());
    store.appendCohortEvent(
      makeFixtureCohortEvent({
        id: "cohort_event_01",
        cohortId: cohort.id,
        type: "VALIDATED",
        effectiveAt: "2026-09-20T09:01:00.000Z",
      }),
    );
    store.recordFirstForecast(cohort.id, "forecast_01");

    expect(() =>
      store.appendCohortEvent(
        makeFixtureCohortEvent({
          id: "cohort_event_02",
          cohortId: cohort.id,
          type: "PAUSED",
          effectiveAt: "2026-09-20T09:02:00.000Z",
        }),
      ),
    ).toThrow("locked after its first forecast");
  });

  it("requires registry content to remain immutable and publication roots timely", () => {
    const store = registry();
    const entry = store.appendRegistryEntry(makeFixtureRegistryEntry());
    expect(() =>
      store.appendRegistryEntry(
        makeFixtureRegistryEntry({ id: entry.id, payload: { version: 2 } }),
      ),
    ).toThrow("immutable payload");

    expect(
      store.appendPublicationReceipt(makeFixturePublicationReceipt()).status,
    ).toBe("TIMELY");
    expect(() =>
      store.appendPublicationReceipt(
        makeFixturePublicationReceipt({
          id: "receipt_late",
          receivedAt: "2026-09-20T10:01:00.000Z",
        }),
      ),
    ).toThrow();
  });
});
