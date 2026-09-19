import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Canonical } from "./canonical-json";
import { LedgerConflictError, LedgerInvariantError } from "./errors";
import { InMemoryLedgerRepository } from "./in-memory";
import { rebuildLedgerProjection } from "./replay";

const clock = () => new Date("2026-09-19T12:00:00.000Z");

function repository() {
  let nextId = 0;
  return new InMemoryLedgerRepository({
    now: clock,
    id: (prefix) => `${prefix}_${String(++nextId).padStart(4, "0")}`,
  });
}

function seedPublication(repo: InMemoryLedgerRepository) {
  const snapshot = repo.insertSnapshot({
    id: "snapshot_01",
    symbol: "AAPL",
    provider: "fixture",
    cutoffAt: "2026-09-18T21:00:00.000Z",
    latestMarketSession: "2026-09-18",
    state: { returns: [0.01, -0.02], risk: 41 },
  });
  const judgment = repo.insertJudgment({
    id: "judgment_01",
    snapshotId: snapshot.id,
    provider: "fixture",
    modelVersion: "jev-fixture-v1",
    questionVersion: "questions-v1",
    answers: {
      direction: { up: 0.62, flat: 0.23, down: 0.15 },
    },
  });

  return repo.publishForecast({
    id: "forecast_01",
    publicationKey: "AAPL:2026-09-18:position:v1",
    snapshotId: snapshot.id,
    judgmentId: judgment.id,
    symbol: "AAPL",
    mode: "position",
    horizonSessions: 20,
    cutoffAt: "2026-09-18T21:00:00.000Z",
    latestMarketSession: "2026-09-18",
    modelVersion: "jev-fixture-v1",
    questionVersion: "questions-v1",
    policyVersion: "policy-v1",
  });
}

describe("canonical ledger hashing", () => {
  it("sorts object keys recursively and produces a stable SHA-256", () => {
    const left = { z: [{ b: true, a: null }], a: 4 };
    const right = { a: 4, z: [{ a: null, b: true }] };

    expect(canonicalJson(left)).toBe('{"a":4,"z":[{"a":null,"b":true}]}');
    expect(sha256Canonical(left)).toBe(sha256Canonical(right));
    expect(sha256Canonical(left)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects values that JSON cannot preserve exactly", () => {
    expect(() => canonicalJson({ bad: Number.NaN })).toThrow(
      LedgerInvariantError,
    );
    expect(() => canonicalJson({ missing: undefined } as never)).toThrow(
      LedgerInvariantError,
    );
    expect(() => canonicalJson(new Array(2) as never)).toThrow(
      LedgerInvariantError,
    );
  });
});

describe("immutable forecast ledger", () => {
  it("returns the frozen forecast when a publication key is replayed", () => {
    const repo = repository();
    const first = seedPublication(repo);
    const replay = repo.publishForecast({
      ...first.value,
      id: "forecast_replayed",
      publicationKey: first.value.publicationKey,
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.value.id).toBe(first.value.id);
    expect(repo.readAll().forecasts).toHaveLength(1);
    expect(repo.readAll().forecastEvents).toHaveLength(1);
  });

  it("rejects attempts to replace immutable snapshots and judgments", () => {
    const repo = repository();
    seedPublication(repo);

    expect(() =>
      repo.insertSnapshot({
        id: "snapshot_01",
        symbol: "AAPL",
        provider: "fixture",
        cutoffAt: "2026-09-18T21:00:00.000Z",
        latestMarketSession: "2026-09-18",
        state: { risk: 99 },
      }),
    ).toThrow(LedgerConflictError);
    expect(() =>
      repo.insertJudgment({
        id: "judgment_01",
        snapshotId: "snapshot_01",
        provider: "fixture",
        modelVersion: "changed",
        questionVersion: "questions-v1",
        answers: { direction: { up: 1, flat: 0, down: 0 } },
      }),
    ).toThrow(LedgerConflictError);
  });

  it("rejects backward, duplicate terminal, and orphan lifecycle events", () => {
    const repo = repository();
    const published = seedPublication(repo).value;
    repo.appendForecastEvent({
      forecastId: published.id,
      type: "resolved",
      reason: "fixed_horizon_reached",
    });

    expect(() =>
      repo.appendForecastEvent({ forecastId: published.id, type: "published" }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      repo.appendForecastEvent({ forecastId: published.id, type: "void" }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      repo.appendForecastEvent({ forecastId: "missing", type: "resolved" }),
    ).toThrow(LedgerInvariantError);
  });

  it("keeps correction history and rebuilds the same active projection", () => {
    const repo = repository();
    const forecast = seedPublication(repo).value;
    const original = repo.appendOutcome({
      id: "outcome_original",
      forecastId: forecast.id,
      realizedLabel: "up",
      adjustedReturn: 0.12,
      sourceBarHash: "a".repeat(64),
    });
    repo.appendForecastEvent({
      forecastId: forecast.id,
      type: "resolved",
      reason: "fixed_horizon_reached",
    });
    const corrected = repo.appendOutcome({
      id: "outcome_corrected",
      forecastId: forecast.id,
      realizedLabel: "flat",
      adjustedReturn: 0.004,
      sourceBarHash: "b".repeat(64),
      correctionOfOutcomeId: original.id,
      correctionReason: "provider_split_revision",
    });
    repo.appendForecastEvent({
      forecastId: forecast.id,
      type: "correction",
      reason: "provider_split_revision",
      referencesEventId: repo
        .readAll()
        .forecastEvents.find((event) => event.type === "resolved")?.id,
    });

    const rebuilt = rebuildLedgerProjection(repo.readAll());
    const current = repo.projection();

    expect(repo.readAll().outcomes).toHaveLength(2);
    expect(current.activeOutcomeByForecast[forecast.id]?.id).toBe(corrected.id);
    expect(rebuilt).toEqual(current);
    expect(current.forecastStatusById[forecast.id]).toBe("resolved");
  });
});

describe("jobs, picks, consent, and public gates", () => {
  it("keeps failed attempts terminal and requires retries to append", () => {
    const repo = repository();
    repo.recordJobAttempt({
      id: "attempt_1",
      operationKey: "publish:AAPL:2026-09-18",
      attemptNumber: 1,
      terminalStatus: "failed",
      errorCode: "PROVIDER_TIMEOUT",
    });
    repo.recordJobAttempt({
      id: "attempt_2",
      operationKey: "publish:AAPL:2026-09-18",
      attemptNumber: 2,
      terminalStatus: "succeeded",
    });

    expect(
      repo.readAll().jobAttempts.map((attempt) => attempt.terminalStatus),
    ).toEqual(["failed", "succeeded"]);
    expect(() =>
      repo.recordJobAttempt({
        id: "attempt_1",
        operationKey: "publish:AAPL:2026-09-18",
        attemptNumber: 1,
        terminalStatus: "succeeded",
      }),
    ).toThrow(LedgerConflictError);
    expect(() =>
      repo.recordJobAttempt({
        id: "attempt_3",
        operationKey: "publish:AAPL:2026-09-18",
        attemptNumber: 3,
        terminalStatus: "failed",
        errorCode: "SHOULD_NOT_RETRY_SUCCESS",
      }),
    ).toThrow(LedgerInvariantError);
  });

  it("freezes one blind pick per visitor and forecast", () => {
    const repo = repository();
    const forecast = seedPublication(repo).value;
    const first = repo.recordVisitorPick({
      id: "pick_1",
      forecastId: forecast.id,
      visitorToken: "browser-random-token",
      choice: "up",
      expiresAt: "2026-10-19T12:00:00.000Z",
    });
    const duplicate = repo.recordVisitorPick({
      id: "pick_2",
      forecastId: forecast.id,
      visitorToken: "browser-random-token",
      choice: "down",
      expiresAt: "2026-10-19T12:00:00.000Z",
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.value).toEqual(first.value);
    expect(repo.readAll().visitorPicks).toHaveLength(1);
    expect(repo.readAll().visitorPicks[0]).not.toHaveProperty("identifierId");
  });

  it("stores no analytics without affirmative consent and expires identifiers", () => {
    const repo = repository();
    expect(
      repo.recordAnalyticsEvent({
        id: "analytics_refused",
        event: "stock_view",
        consent: false,
        browserToken: "must-not-be-stored",
        expiresAt: "2026-10-19T12:00:00.000Z",
      }),
    ).toBeNull();

    repo.recordAnalyticsEvent({
      id: "analytics_accepted",
      event: "stock_view",
      consent: true,
      browserToken: "expiring-token",
      symbol: "AAPL",
      expiresAt: "2026-09-20T00:00:00.000Z",
    });
    expect(repo.readAll().analyticsEvents).toHaveLength(1);
    expect(repo.readAll().analyticsEvents[0]).not.toHaveProperty(
      "identifierId",
    );
    expect(repo.inspectPrivateIdentifiers()).toHaveLength(1);

    const result = repo.purgeExpiredIdentifiers("2026-09-21T00:00:00.000Z");
    expect(result.purged).toBe(1);
    expect(repo.inspectPrivateIdentifiers()).toHaveLength(0);
    expect(repo.analyticsAggregate()).toEqual({ stock_view: 1 });
  });

  it("caps private identifier retention at thirty days", () => {
    const repo = repository();
    repo.recordAnalyticsEvent({
      id: "analytics_capped",
      event: "stock_view",
      consent: true,
      browserToken: "long-lived-token",
      expiresAt: "2027-09-19T12:00:00.000Z",
    });

    expect(repo.inspectPrivateIdentifiers()[0]?.expiresAt).toBe(
      "2026-10-19T12:00:00.000Z",
    );
  });

  it("fails public mode closed until provider rights and processor terms are active", () => {
    const repo = repository();
    expect(repo.publicModeGate("2026-09-19T12:00:00.000Z")).toEqual({
      allowed: false,
      blockers: ["PROVIDER_RIGHTS_MISSING", "PROCESSOR_TERMS_MISSING"],
    });

    repo.appendProviderRights({
      id: "rights_1",
      provider: "licensed-provider",
      planOrContract: "display-contract-v1",
      permittedFields: ["daily_ohlcv"],
      audience: "public",
      retention: "indefinite-derived-30d-raw",
      attribution: "Provider attribution",
      derivedOutputs: true,
      screenshotsAndVideo: true,
      onwardAiProcessing: true,
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      reviewedBy: "operator@example.test",
    });
    repo.appendProcessorTerms({
      id: "terms_1",
      processor: "openrouter-jev",
      retention: "none",
      training: "disabled",
      residency: "us",
      deletion: "request-supported",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      reviewedBy: "operator@example.test",
    });

    expect(repo.publicModeGate("2026-09-19T12:00:00.000Z")).toEqual({
      allowed: true,
      blockers: [],
    });
  });
});
