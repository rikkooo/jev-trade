import { describe, expect, it } from "vitest";

import {
  aggregateScorecard,
  alwaysUpDistribution,
  computeEligibleUniverseBuyAndHold,
  computePaperMetrics,
  createReliabilityBuckets,
  momentumDistribution,
  multiclassBrier,
  scoredLogLoss,
  scoreForecast,
} from "./index";

describe("scorecard metric primitives", () => {
  it("matches hand-calculated multiclass Brier and clipped log loss", () => {
    const probabilities = { up: 0.7, flat: 0.2, down: 0.1 } as const;

    expect(multiclassBrier(probabilities, "up")).toBeCloseTo(
      (0.3 ** 2 + 0.2 ** 2 + 0.1 ** 2) / 3,
      12,
    );
    expect(scoredLogLoss(probabilities, "up")).toBeCloseTo(-Math.log(0.7), 12);
    expect(scoredLogLoss(alwaysUpDistribution(), "down")).toBeCloseTo(
      -Math.log(1e-15),
      12,
    );
    expect(alwaysUpDistribution().down).toBe(0);
  });

  it("builds deterministic momentum calls at inclusive neutral boundaries", () => {
    expect(momentumDistribution(0.005, 0.005)).toEqual({
      up: 0,
      flat: 1,
      down: 0,
    });
    expect(momentumDistribution(-0.005, 0.005)).toEqual({
      up: 0,
      flat: 1,
      down: 0,
    });
    expect(momentumDistribution(0.005_001, 0.005).up).toBe(1);
    expect(momentumDistribution(-0.005_001, 0.005).down).toBe(1);
  });

  it("merges sparse reliability ranges and preserves observation totals", () => {
    const observations = Array.from({ length: 25 }, (_, index) => ({
      confidence: index < 5 ? 0.43 : 0.71,
      correct: index % 2 === 0,
    }));

    const buckets = createReliabilityBuckets(observations, 20);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ count: 25, lowerInclusive: 0.4 });
    expect(buckets[0]?.upperInclusive).toBe(0.8);
    expect(buckets.reduce((total, bucket) => total + bucket.count, 0)).toBe(25);
  });
});

describe("paper comparators", () => {
  it("matches hand-calculated return, drawdown, and turnover", () => {
    const result = computePaperMetrics({
      scorecardForecastIds: ["f1", "f2"],
      paperForecastIds: ["f2", "f1"],
      equityCurve: [
        { date: "2026-01-02", equity: 100 },
        { date: "2026-01-03", equity: 120 },
        { date: "2026-01-04", equity: 90 },
        { date: "2026-01-05", equity: 110 },
      ],
      tradedNotional: 210,
    });
    expect(result.returnRate).toBeCloseTo(0.1, 12);
    expect(result.maximumDrawdown).toBeCloseTo(0.25, 12);
    expect(result.turnover).toBeCloseTo(2, 12);
  });

  it("rejects paper metrics from a different forecast cohort", () => {
    expect(() =>
      computePaperMetrics({
        scorecardForecastIds: ["verified"],
        paperForecastIds: ["late-attestation"],
        equityCurve: [
          { date: "2026-01-02", equity: 100 },
          { date: "2026-01-03", equity: 101 },
        ],
        tradedNotional: 10,
      }),
    ).toThrow(/verified scorecard cohort/i);
  });

  it("builds an equal-weight eligible-universe buy-and-hold curve", () => {
    const result = computeEligibleUniverseBuyAndHold({
      startingEquity: 100,
      observations: [
        { date: "2026-01-02", adjustedCloseBySymbol: { A: 10, B: 20 } },
        { date: "2026-01-03", adjustedCloseBySymbol: { A: 12, B: 18 } },
        { date: "2026-01-04", adjustedCloseBySymbol: { A: 11, B: 22 } },
      ],
    });

    expect(result.equityCurve).toEqual([
      { date: "2026-01-02", equity: 100 },
      { date: "2026-01-03", equity: 105 },
      { date: "2026-01-04", equity: 110 },
    ]);
    expect(result.returnRate).toBeCloseTo(0.1, 12);
    expect(result.maximumDrawdown).toBe(0);
  });
});

describe("prospective aggregation", () => {
  const resolved = (overrides: Record<string, unknown> = {}) => ({
    id: "f1",
    symbol: "ACME",
    resolutionDate: "2026-01-10",
    mode: "sprint" as const,
    horizonSessions: 5 as const,
    modelVersion: "jev-v1",
    policyVersion: "policy-v1",
    cohort: "prospective" as const,
    lifecycle: "resolved" as const,
    attestation: "timely" as const,
    policyAction: "up" as const,
    probabilities: { up: 0.7, flat: 0.2, down: 0.1 },
    outcome: "up" as const,
    trailingReturn: 0.03,
    neutralBand: 0.015,
    ...overrides,
  });

  it("excludes ineligible states, reports coverage/pass rate, and uses the active correction", () => {
    const result = aggregateScorecard([
      resolved(),
      resolved({ id: "late", attestation: "late" }),
      resolved({ id: "void", lifecycle: "void", outcome: undefined }),
      resolved({ id: "open", lifecycle: "published", outcome: undefined }),
      resolved({ id: "retro", cohort: "retrospective" }),
      resolved({ id: "failed", lifecycle: "failed", probabilities: undefined }),
      resolved({
        id: "corrected",
        outcome: "flat",
        outcomeHistory: [
          { id: "o1", label: "up", active: false },
          { id: "o2", label: "flat", active: true, correctionOf: "o1" },
        ],
      }),
    ]);

    expect(result.attemptCount).toBe(6);
    expect(result.publishedCount).toBe(5);
    expect(result.publicationSuccessRate).toBeCloseTo(5 / 6, 12);
    expect(result.coverageRate).toBe(1);
    expect(result.passRate).toBe(0);
    expect(result.scoredForecastCount).toBe(2);
    expect(result.exclusionCounts).toEqual({
      externallyUnverified: 1,
      failed: 1,
      fixtureOrRetrospective: 1,
      unresolved: 1,
      void: 1,
    });
    expect(result.sampleAssessment.state).toBe("insufficient_sample");
    expect(result.sampleAssessment.superiorityClaimAllowed).toBe(false);
    expect(result.distinctResolutionDates).toBe(1);
  });

  it("averages Jev-versus-baseline deltas within dates before dates", () => {
    const records = [
      resolved({ id: "a", resolutionDate: "2026-01-10" }),
      resolved({
        id: "b",
        resolutionDate: "2026-01-10",
        probabilities: { up: 0.1, flat: 0.2, down: 0.7 },
      }),
      resolved({
        id: "c",
        resolutionDate: "2026-01-11",
        probabilities: { up: 0.6, flat: 0.3, down: 0.1 },
      }),
    ];

    const result = aggregateScorecard(records);
    const raw = records.map((record) => scoreForecast(record));
    const dayOne =
      ((raw[0]?.brier ?? 0) -
        (raw[0]?.alwaysUpBrier ?? 0) +
        ((raw[1]?.brier ?? 0) - (raw[1]?.alwaysUpBrier ?? 0))) /
      2;
    const dayTwo = (raw[2]?.brier ?? 0) - (raw[2]?.alwaysUpBrier ?? 0);

    expect(result.baselines.alwaysUp.clusteredBrierDelta).toBeCloseTo(
      (dayOne + dayTwo) / 2,
      12,
    );
    expect(result.baselines.momentum.name).toBe("Deterministic momentum");
  });

  it("defines Position coverage as ENTER and Sprint coverage as non-PASS", () => {
    const records = [
      resolved({
        id: "position-enter",
        mode: "position",
        policyAction: "enter",
      }),
      resolved({ id: "position-wait", mode: "position", policyAction: "wait" }),
      resolved({ id: "sprint-up", policyAction: "up" }),
      resolved({ id: "sprint-pass", policyAction: "pass" }),
      resolved({ id: "failed", lifecycle: "failed", probabilities: undefined }),
    ];

    const result = aggregateScorecard(records);

    expect(result.publicationSuccessRate).toBe(0.8);
    expect(result.coverageRate).toBe(0.5);
    expect(result.passRate).toBe(0.5);
    expect((result.coverageRate ?? 0) + (result.passRate ?? 0)).toBe(1);
  });

  it("keeps an active unresolved horizon in the low-sample gate", () => {
    const readyFiveSessionCohort = Array.from({ length: 100 }, (_, index) =>
      resolved({
        id: `five-${index}`,
        resolutionDate: `2026-02-${String((index % 20) + 1).padStart(2, "0")}`,
      }),
    );
    const unresolvedTwentySession = resolved({
      id: "twenty-open",
      mode: "position",
      horizonSessions: 20,
      lifecycle: "published",
      resolutionDate: undefined,
      outcome: undefined,
      policyAction: "enter",
    });

    const result = aggregateScorecard([
      ...readyFiveSessionCohort,
      unresolvedTwentySession,
    ]);

    expect(result.scoredForecastCount).toBe(100);
    expect(result.distinctResolutionDates).toBe(20);
    expect(result.sampleAssessment.state).toBe("insufficient_sample");
    expect(result.sampleAssessment.superiorityClaimAllowed).toBe(false);
  });
});
