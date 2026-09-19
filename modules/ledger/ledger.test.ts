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
    knowledgeCutoffAt: "2026-09-18T23:00:00.000Z",
    providerFetchedAt: "2026-09-18T22:00:00.000Z",
    sourceUpdatedAt: "2026-09-18T21:30:00.000Z",
    latestMarketSession: "2026-09-18",
    sourceManifest: [
      {
        sourceId: "fixture:AAPL",
        sourceRevision: "v1",
        sourceHash: "a".repeat(64),
        availableAt: "2026-09-18T21:30:00.000Z",
      },
    ],
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
  const policy = repo.insertPolicyDecision({
    id: "policy_01",
    judgmentId: judgment.id,
    policyVersion: "policy-v1",
    action: "enter",
    gateTrace: { eligible: true },
    sizing: { shares: 10 },
  });

  return repo.publishForecast({
    id: "forecast_01",
    publicationKey: "AAPL:2026-09-18:position:v1",
    snapshotId: snapshot.id,
    judgmentId: judgment.id,
    policyDecisionId: policy.id,
    symbol: "AAPL",
    mode: "position",
    horizonSessions: 20,
    cutoffAt: "2026-09-18T21:00:00.000Z",
    latestMarketSession: "2026-09-18",
    modelVersion: "jev-fixture-v1",
    questionVersion: "questions-v1",
    policyVersion: "policy-v1",
    deploymentSha: "deadbeef",
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
    const samePayload = structuredClone(first.value);
    Reflect.deleteProperty(samePayload, "createdAt");
    const replay = repo.publishForecast(samePayload);

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.value.id).toBe(first.value.id);
    expect(repo.readAll().forecasts).toHaveLength(1);
    expect(repo.readAll().forecastEvents).toHaveLength(1);
  });

  it("rejects reuse of a publication key with a different immutable payload", () => {
    const repo = repository();
    const first = seedPublication(repo).value;
    const samePayload = structuredClone(first);
    Reflect.deleteProperty(samePayload, "createdAt");

    expect(() =>
      repo.publishForecast({ ...samePayload, horizonSessions: 5 }),
    ).toThrow(LedgerConflictError);
    expect(repo.readAll().forecasts).toHaveLength(1);
  });

  it("mirrors every durable forecast dependency identity check", () => {
    const repo = repository();
    const forecast = seedPublication(repo).value;
    const payload = structuredClone(forecast);
    Reflect.deleteProperty(payload, "createdAt");
    const mismatches = [
      { symbol: "MSFT" },
      { cutoffAt: "2026-09-18T22:00:00.000Z" },
      { latestMarketSession: "2026-09-17" },
      { modelVersion: "jev-other" },
      { questionVersion: "questions-v2" },
      { policyVersion: "policy-v2" },
      { policyDecisionId: "missing-policy" },
    ];

    for (const [index, mismatch] of mismatches.entries()) {
      expect(() =>
        repo.publishForecast({
          ...payload,
          ...mismatch,
          id: `forecast_mismatch_${index}`,
          publicationKey: `mismatch:${index}`,
        }),
      ).toThrow();
    }

    const alternateSnapshot = repo.insertSnapshot({
      id: "snapshot_02",
      symbol: "AAPL",
      provider: "fixture",
      cutoffAt: "2026-09-18T21:00:00.000Z",
      knowledgeCutoffAt: "2026-09-18T23:00:00.000Z",
      providerFetchedAt: "2026-09-18T22:00:00.000Z",
      sourceUpdatedAt: "2026-09-18T21:30:00.000Z",
      latestMarketSession: "2026-09-18",
      sourceManifest: [
        {
          sourceId: "fixture:AAPL",
          sourceRevision: "v2",
          sourceHash: "b".repeat(64),
          availableAt: "2026-09-18T21:30:00.000Z",
        },
      ],
      state: { risk: 42 },
    });
    const alternateJudgment = repo.insertJudgment({
      id: "judgment_02",
      snapshotId: alternateSnapshot.id,
      provider: "fixture",
      modelVersion: payload.modelVersion,
      questionVersion: payload.questionVersion,
      answers: { direction: { up: 0.7, flat: 0.2, down: 0.1 } },
    });
    const alternatePolicy = repo.insertPolicyDecision({
      id: "policy_02",
      judgmentId: alternateJudgment.id,
      policyVersion: payload.policyVersion,
      action: "enter",
      gateTrace: { eligible: true },
    });

    expect(() =>
      repo.publishForecast({
        ...payload,
        id: "forecast_wrong_judgment_snapshot",
        publicationKey: "mismatch:judgment-snapshot",
        judgmentId: alternateJudgment.id,
        policyDecisionId: alternatePolicy.id,
      }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      repo.publishForecast({
        ...payload,
        id: "forecast_wrong_policy_judgment",
        publicationKey: "mismatch:policy-judgment",
        policyDecisionId: alternatePolicy.id,
      }),
    ).toThrow(LedgerInvariantError);
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
        knowledgeCutoffAt: "2026-09-18T23:00:00.000Z",
        providerFetchedAt: "2026-09-18T22:00:00.000Z",
        sourceUpdatedAt: "2026-09-18T21:30:00.000Z",
        latestMarketSession: "2026-09-18",
        sourceManifest: [
          {
            sourceId: "fixture:AAPL",
            sourceRevision: "v1",
            sourceHash: "a".repeat(64),
            availableAt: "2026-09-18T21:30:00.000Z",
          },
        ],
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

  it("rejects durable source provenance observed after the knowledge cutoff", () => {
    const repo = repository();

    expect(() =>
      repo.insertSnapshot({
        id: "snapshot_future_source",
        symbol: "AAPL",
        provider: "fixture",
        cutoffAt: "2026-09-18T21:00:00.000Z",
        knowledgeCutoffAt: "2026-09-18T23:00:00.000Z",
        providerFetchedAt: "2026-09-18T22:00:00.000Z",
        sourceUpdatedAt: "2026-09-18T21:30:00.000Z",
        latestMarketSession: "2026-09-18",
        sourceManifest: [
          {
            sourceId: "fixture:AAPL",
            sourceRevision: "v2",
            sourceHash: "b".repeat(64),
            availableAt: "2026-09-18T23:00:00.001Z",
          },
        ],
        state: { risk: 41 },
      }),
    ).toThrow(LedgerInvariantError);
  });

  it("rejects backward, duplicate terminal, and orphan lifecycle events", () => {
    const repo = repository();
    const published = seedPublication(repo).value;
    repo.voidForecast({
      id: "void_1",
      forecastId: published.id,
      type: "void",
      reason: "irrecoverable_missing_bar",
    });

    expect(() =>
      repo.voidForecast({
        id: "void_2",
        forecastId: published.id,
        type: "void",
        reason: "duplicate",
      }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      repo.voidForecast({
        id: "void_missing",
        forecastId: "missing",
        type: "void",
        reason: "missing",
      }),
    ).toThrow(LedgerInvariantError);
  });

  it("keeps correction history and rebuilds the same active projection", () => {
    const repo = repository();
    const forecast = seedPublication(repo).value;
    const resolution = repo.resolveForecast({
      event: {
        id: "resolved_1",
        forecastId: forecast.id,
        type: "resolved",
        reason: "fixed_horizon_reached",
      },
      outcome: {
        id: "outcome_original",
        forecastId: forecast.id,
        realizedLabel: "up",
        adjustedReturn: 0.12,
        sourceBarHash: "a".repeat(64),
      },
    });
    expect(
      repo.resolveForecast({
        event: {
          id: "resolved_1",
          forecastId: forecast.id,
          type: "resolved",
          reason: "fixed_horizon_reached",
        },
        outcome: {
          id: "outcome_original",
          forecastId: forecast.id,
          realizedLabel: "up",
          adjustedReturn: 0.12,
          sourceBarHash: "a".repeat(64),
        },
      }).created,
    ).toBe(false);
    const correction = repo.correctForecastOutcome({
      event: {
        id: "correction_1",
        forecastId: forecast.id,
        type: "correction",
        reason: "provider_split_revision",
        referencesEventId: resolution.value.event.id,
      },
      outcome: {
        id: "outcome_corrected",
        forecastId: forecast.id,
        realizedLabel: "flat",
        adjustedReturn: 0.004,
        sourceBarHash: "b".repeat(64),
        correctionOfOutcomeId: resolution.value.outcome.id,
        correctionReason: "provider_split_revision",
      },
    });

    const rebuilt = rebuildLedgerProjection(repo.readAll());
    const current = repo.projection();

    expect(repo.readAll().outcomes).toHaveLength(2);
    expect(current.activeOutcomeByForecast[forecast.id]?.id).toBe(
      correction.value.outcome.id,
    );
    expect(rebuilt).toEqual(current);
    expect(current.forecastStatusById[forecast.id]).toBe("resolved");
  });

  it("rejects non-finite optional scores and paper prices", () => {
    const repo = repository();
    const forecast = seedPublication(repo).value;
    expect(() =>
      repo.resolveForecast({
        event: {
          id: "resolved_nonfinite",
          forecastId: forecast.id,
          type: "resolved",
          reason: "fixed_horizon_reached",
        },
        outcome: {
          id: "outcome_nonfinite",
          forecastId: forecast.id,
          realizedLabel: "up",
          adjustedReturn: 0.03,
          brierScore: Number.NaN,
          sourceBarHash: "a".repeat(64),
        },
      }),
    ).toThrow(LedgerInvariantError);
    expect(repo.readAll().forecastEvents).toHaveLength(1);
    expect(() =>
      repo.appendPaperEvent({
        id: "paper_nonfinite",
        type: "entry",
        symbol: "AAPL",
        cashDelta: -100,
        sharesDelta: 1,
        price: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(LedgerInvariantError);
  });

  it("rejects an outcome until its forecast is resolved", () => {
    const repo = repository();
    const forecast = seedPublication(repo).value;

    expect(() =>
      repo.resolveForecast({
        event: {
          id: "resolved_too_early",
          forecastId: forecast.id,
          type: "resolved",
          reason: "fixed_horizon_reached",
        },
        outcome: {
          id: "outcome_too_early",
          forecastId: "missing",
          realizedLabel: "up",
          adjustedReturn: 0.03,
          sourceBarHash: "a".repeat(64),
        },
      }),
    ).toThrow(LedgerInvariantError);
    expect(repo.readAll().forecastEvents).toHaveLength(1);
  });

  it("allows correction references only on paper correction events", () => {
    const repo = repository();
    repo.appendPaperEvent({
      id: "deposit",
      type: "deposit",
      cashDelta: 100,
      sharesDelta: 0,
    });

    expect(() =>
      repo.appendPaperEvent({
        id: "bad-mark",
        type: "mark",
        cashDelta: 0,
        sharesDelta: 0,
        correctionOfEventId: "deposit",
      }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      repo.appendPaperEvent({
        id: "bad-correction",
        type: "correction",
        cashDelta: 0,
        sharesDelta: 0,
      }),
    ).toThrow(LedgerInvariantError);

    expect(
      repo.appendPaperEvent({
        id: "correction",
        type: "correction",
        cashDelta: -100,
        sharesDelta: 0,
        correctionOfEventId: "deposit",
        reason: "operator correction",
      }).type,
    ).toBe("correction");
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
    expect(
      repo.recordJobAttempt({
        id: "attempt_2",
        operationKey: "publish:AAPL:2026-09-18",
        attemptNumber: 2,
        terminalStatus: "succeeded",
      }).created,
    ).toBe(false);
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
    const requirements = {
      at: "2026-09-19T12:00:00.000Z",
      expectedProvider: "licensed-provider",
      expectedProcessor: "openrouter-jev",
      requiredFields: ["daily_ohlcv"],
    } as const;
    expect(repo.publicModeGate(requirements)).toEqual({
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

    expect(repo.publicModeGate(requirements)).toEqual({
      allowed: true,
      blockers: [],
    });
  });
});
