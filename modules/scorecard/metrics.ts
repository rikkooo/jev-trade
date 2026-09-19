import {
  SCORE_DIRECTIONS,
  type DirectionDistribution,
  type ReliabilityBucket,
  type ReliabilityObservation,
  type ScoreDirection,
} from "./types";

export const LOG_LOSS_EPSILON = 1e-15;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

export function validateDistribution(
  distribution: DirectionDistribution,
): void {
  let total = 0;
  for (const direction of SCORE_DIRECTIONS) {
    const value = distribution[direction];
    assertFinite(value, `probability.${direction}`);
    if (value < 0 || value > 1) {
      throw new Error(`probability.${direction} must be in 0..1`);
    }
    total += value;
  }
  if (Math.abs(total - 1) > 1e-12) {
    throw new Error("direction probabilities must sum to 1");
  }
}

export function multiclassBrier(
  distribution: DirectionDistribution,
  outcome: ScoreDirection,
): number {
  validateDistribution(distribution);
  return (
    SCORE_DIRECTIONS.reduce((sum, direction) => {
      const observed = direction === outcome ? 1 : 0;
      return sum + (distribution[direction] - observed) ** 2;
    }, 0) / SCORE_DIRECTIONS.length
  );
}

export function scoredLogLoss(
  distribution: DirectionDistribution,
  outcome: ScoreDirection,
): number {
  validateDistribution(distribution);
  const clipped = Math.min(
    1 - LOG_LOSS_EPSILON,
    Math.max(LOG_LOSS_EPSILON, distribution[outcome]),
  );
  return -Math.log(clipped);
}

export function topDirection(
  distribution: DirectionDistribution,
): ScoreDirection {
  validateDistribution(distribution);
  return SCORE_DIRECTIONS.reduce((best, direction) =>
    distribution[direction] > distribution[best] ? direction : best,
  );
}

interface MutableBucket {
  lowerInclusive: number;
  upperInclusive: number;
  observations: ReliabilityObservation[];
}

const RELIABILITY_EDGES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

function baseBuckets(
  observations: readonly ReliabilityObservation[],
): MutableBucket[] {
  for (const observation of observations) {
    assertFinite(observation.confidence, "reliability confidence");
    if (observation.confidence < 0 || observation.confidence > 1) {
      throw new Error("reliability confidence must be in 0..1");
    }
  }
  return RELIABILITY_EDGES.slice(0, -1)
    .map((lowerInclusive, index) => {
      const upperInclusive = RELIABILITY_EDGES[index + 1] ?? 1;
      return {
        lowerInclusive,
        upperInclusive,
        observations: observations.filter(({ confidence }) =>
          upperInclusive === 1
            ? confidence >= lowerInclusive && confidence <= upperInclusive
            : confidence >= lowerInclusive && confidence < upperInclusive,
        ),
      };
    })
    .filter((bucket) => bucket.observations.length > 0);
}

export function createReliabilityBuckets(
  observations: readonly ReliabilityObservation[],
  minimumCount = 20,
): readonly ReliabilityBucket[] {
  if (!Number.isInteger(minimumCount) || minimumCount < 1) {
    throw new Error("reliability minimum count must be a positive integer");
  }
  if (observations.length === 0) return [];

  const merged: MutableBucket[] = [];
  let pending: MutableBucket | undefined;
  for (const bucket of baseBuckets(observations)) {
    pending = pending
      ? {
          lowerInclusive: pending.lowerInclusive,
          upperInclusive: bucket.upperInclusive,
          observations: [...pending.observations, ...bucket.observations],
        }
      : { ...bucket, observations: [...bucket.observations] };
    if (pending.observations.length >= minimumCount) {
      merged.push(pending);
      pending = undefined;
    }
  }
  if (pending) {
    const previous = merged.pop();
    merged.push(
      previous
        ? {
            lowerInclusive: previous.lowerInclusive,
            upperInclusive: pending.upperInclusive,
            observations: [...previous.observations, ...pending.observations],
          }
        : {
            lowerInclusive: 0,
            upperInclusive: 1,
            observations: pending.observations,
          },
    );
  }

  return merged.map((bucket) => ({
    lowerInclusive: bucket.lowerInclusive,
    upperInclusive: bucket.upperInclusive,
    count: bucket.observations.length,
    meanConfidence:
      bucket.observations.reduce(
        (total, observation) => total + observation.confidence,
        0,
      ) / bucket.observations.length,
    observedAccuracy:
      bucket.observations.filter((observation) => observation.correct).length /
      bucket.observations.length,
    minimumCountMet: bucket.observations.length >= minimumCount,
  }));
}
