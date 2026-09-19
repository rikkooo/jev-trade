import { alwaysUpDistribution, momentumDistribution } from "./baselines";
import {
  createReliabilityBuckets,
  multiclassBrier,
  scoredLogLoss,
  topDirection,
} from "./metrics";
import type {
  ForecastScore,
  ScorecardAggregate,
  ScorecardRecord,
  ScoreDirection,
} from "./types";

const MINIMUM_FORECASTS = 100 as const;
const MINIMUM_DISTINCT_DATES = 20 as const;
const MINIMUM_PER_ACTIVE_HORIZON = 20 as const;

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function activeOutcome(record: ScorecardRecord): ScoreDirection | undefined {
  if (!record.outcomeHistory) return record.outcome;
  const active = record.outcomeHistory.filter((outcome) => outcome.active);
  if (active.length !== 1) {
    throw new Error(
      `forecast ${record.id} must have exactly one active outcome version`,
    );
  }
  return active[0]?.label;
}

export function scoreForecast(record: ScorecardRecord): ForecastScore {
  const outcome = activeOutcome(record);
  if (
    record.lifecycle !== "resolved" ||
    !record.resolutionDate ||
    !record.probabilities ||
    outcome === undefined ||
    record.trailingReturn === undefined ||
    record.neutralBand === undefined
  ) {
    throw new Error(`forecast ${record.id} is not scoreable`);
  }
  const predicted = topDirection(record.probabilities);
  const alwaysUp = alwaysUpDistribution();
  const momentum = momentumDistribution(
    record.trailingReturn,
    record.neutralBand,
  );
  return {
    forecastId: record.id,
    resolutionDate: record.resolutionDate,
    outcome,
    predicted,
    confidence: record.probabilities[predicted],
    correct: predicted === outcome,
    brier: multiclassBrier(record.probabilities, outcome),
    logLoss: scoredLogLoss(record.probabilities, outcome),
    alwaysUpBrier: multiclassBrier(alwaysUp, outcome),
    alwaysUpLogLoss: scoredLogLoss(alwaysUp, outcome),
    momentumBrier: multiclassBrier(momentum, outcome),
    momentumLogLoss: scoredLogLoss(momentum, outcome),
  };
}

function clusteredDelta(
  scores: readonly ForecastScore[],
  baseline: "alwaysUpBrier" | "momentumBrier",
): number | null {
  const byDate = new Map<string, number[]>();
  for (const score of scores) {
    const values = byDate.get(score.resolutionDate) ?? [];
    values.push(score.brier - score[baseline]);
    byDate.set(score.resolutionDate, values);
  }
  return mean([...byDate.values()].map((values) => mean(values) as number));
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

export function aggregateScorecard(
  records: readonly ScorecardRecord[],
): ScorecardAggregate {
  const prospective = records.filter(
    (record) => record.cohort === "prospective",
  );
  const published = prospective.filter(
    (record) => record.lifecycle !== "failed",
  );
  const scoreable = prospective.filter(
    (record) =>
      record.lifecycle === "resolved" &&
      record.attestation === "timely" &&
      record.probabilities !== undefined &&
      activeOutcome(record) !== undefined,
  );
  const scores = scoreable.map(scoreForecast);
  const distinctDates = new Set(scores.map((score) => score.resolutionDate))
    .size;
  const activeHorizons = [
    ...new Set(published.map((record) => record.horizonSessions)),
  ];
  const everyHorizonReady = activeHorizons.every(
    (horizon) =>
      scoreable.filter((record) => record.horizonSessions === horizon).length >=
      MINIMUM_PER_ACTIVE_HORIZON,
  );
  const comparisonReady =
    scores.length >= MINIMUM_FORECASTS &&
    distinctDates >= MINIMUM_DISTINCT_DATES &&
    activeHorizons.length > 0 &&
    everyHorizonReady;
  const modelVersions = sortedUnique(
    scoreable.map((record) => record.modelVersion),
  );
  const policyVersions = sortedUnique(
    scoreable.map((record) => record.policyVersion),
  );
  const mixture = modelVersions.length > 1 || policyVersions.length > 1;

  return {
    attemptCount: prospective.length,
    publishedCount: published.length,
    scoredForecastCount: scores.length,
    distinctResolutionDates: distinctDates,
    publicationSuccessRate:
      prospective.length === 0 ? null : published.length / prospective.length,
    coverageRate:
      published.length === 0
        ? null
        : published.filter((record) =>
            record.mode === "position"
              ? record.policyAction === "enter"
              : record.policyAction !== "pass",
          ).length / published.length,
    passRate:
      published.length === 0
        ? null
        : published.filter((record) =>
            record.mode === "position"
              ? record.policyAction !== "enter"
              : record.policyAction === "pass",
          ).length / published.length,
    brierScore: mean(scores.map((score) => score.brier)),
    logLoss: mean(scores.map((score) => score.logLoss)),
    hitRate:
      scores.length === 0
        ? null
        : scores.filter((score) => score.correct).length / scores.length,
    reliability: createReliabilityBuckets(
      scores.map((score) => ({
        confidence: score.confidence,
        correct: score.correct,
      })),
    ),
    versions: {
      model: modelVersions,
      policy: policyVersions,
      mixture,
      label: mixture
        ? `Mixed cohort: models ${modelVersions.join(", ")}; policies ${policyVersions.join(", ")}`
        : scores.length === 0
          ? "No scoreable version cohort"
          : `Model ${modelVersions[0]}; policy ${policyVersions[0]}`,
    },
    baselines: {
      alwaysUp: {
        name: "Always up",
        brierScore: mean(scores.map((score) => score.alwaysUpBrier)),
        logLoss: mean(scores.map((score) => score.alwaysUpLogLoss)),
        clusteredBrierDelta: clusteredDelta(scores, "alwaysUpBrier"),
      },
      momentum: {
        name: "Deterministic momentum",
        brierScore: mean(scores.map((score) => score.momentumBrier)),
        logLoss: mean(scores.map((score) => score.momentumLogLoss)),
        clusteredBrierDelta: clusteredDelta(scores, "momentumBrier"),
      },
      buyAndHold: {
        name: "Eligible-universe buy and hold",
        metricClass: "portfolio_comparator",
      },
    },
    exclusionCounts: {
      externallyUnverified: prospective.filter(
        (record) =>
          record.lifecycle === "resolved" && record.attestation !== "timely",
      ).length,
      failed: prospective.filter((record) => record.lifecycle === "failed")
        .length,
      fixtureOrRetrospective: records.length - prospective.length,
      unresolved: prospective.filter(
        (record) => record.lifecycle === "published",
      ).length,
      void: prospective.filter((record) => record.lifecycle === "void").length,
    },
    sampleAssessment: {
      state: comparisonReady ? "comparison_ready" : "insufficient_sample",
      superiorityClaimAllowed: comparisonReady,
      minimumForecasts: MINIMUM_FORECASTS,
      minimumDistinctDates: MINIMUM_DISTINCT_DATES,
      minimumPerActiveHorizon: MINIMUM_PER_ACTIVE_HORIZON,
      warning: comparisonReady
        ? null
        : "Not enough prospective evidence for a superiority claim. Same-date observations and overlapping windows are correlated.",
    },
  };
}
