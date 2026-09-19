export const SCORE_DIRECTIONS = ["up", "flat", "down"] as const;

export type ScoreDirection = (typeof SCORE_DIRECTIONS)[number];
export type DirectionDistribution = Readonly<Record<ScoreDirection, number>>;

export interface OutcomeVersion {
  readonly id: string;
  readonly label: ScoreDirection;
  readonly active: boolean;
  readonly correctionOf?: string;
}

export interface ScorecardRecord {
  readonly id: string;
  readonly symbol: string;
  readonly resolutionDate?: string;
  readonly mode: "position" | "sprint";
  readonly horizonSessions: 1 | 5 | 20;
  readonly modelVersion: string;
  readonly policyVersion: string;
  readonly cohort: "prospective" | "retrospective" | "fixture";
  readonly lifecycle: "failed" | "published" | "resolved" | "void";
  readonly attestation: "timely" | "late" | "missing";
  readonly policyAction:
    "enter" | "hold" | "exit" | "wait" | "up" | "flat" | "down" | "pass";
  readonly probabilities?: DirectionDistribution;
  readonly outcome?: ScoreDirection;
  readonly outcomeHistory?: readonly OutcomeVersion[];
  readonly trailingReturn?: number;
  readonly neutralBand?: number;
}

export interface ForecastScore {
  readonly forecastId: string;
  readonly resolutionDate: string;
  readonly outcome: ScoreDirection;
  readonly predicted: ScoreDirection;
  readonly confidence: number;
  readonly correct: boolean;
  readonly brier: number;
  readonly logLoss: number;
  readonly alwaysUpBrier: number;
  readonly alwaysUpLogLoss: number;
  readonly momentumBrier: number;
  readonly momentumLogLoss: number;
}

export interface ReliabilityObservation {
  readonly confidence: number;
  readonly correct: boolean;
}

export interface ReliabilityBucket {
  readonly lowerInclusive: number;
  readonly upperInclusive: number;
  readonly count: number;
  readonly meanConfidence: number;
  readonly observedAccuracy: number;
  readonly minimumCountMet: boolean;
}

export interface EquityPoint {
  readonly date: string;
  readonly equity: number;
}

export interface PaperMetricInput {
  readonly scorecardForecastIds: readonly string[];
  readonly paperForecastIds: readonly string[];
  readonly equityCurve: readonly EquityPoint[];
  readonly tradedNotional: number;
}

export interface PaperMetrics {
  readonly returnRate: number;
  readonly maximumDrawdown: number;
  readonly turnover: number;
}

export interface BuyAndHoldObservation {
  readonly date: string;
  readonly adjustedCloseBySymbol: Readonly<Record<string, number>>;
}

export interface BuyAndHoldResult extends PaperMetrics {
  readonly equityCurve: readonly EquityPoint[];
  readonly symbols: readonly string[];
  readonly methodology: "equal_weight_frozen_eligible_universe_v1";
}

export interface ScorecardAggregate {
  readonly attemptCount: number;
  readonly publishedCount: number;
  readonly scoredForecastCount: number;
  readonly distinctResolutionDates: number;
  readonly publicationSuccessRate: number | null;
  readonly coverageRate: number | null;
  readonly passRate: number | null;
  readonly brierScore: number | null;
  readonly logLoss: number | null;
  readonly hitRate: number | null;
  readonly reliability: readonly ReliabilityBucket[];
  readonly versions: {
    readonly model: readonly string[];
    readonly policy: readonly string[];
    readonly mixture: boolean;
    readonly label: string;
  };
  readonly baselines: {
    readonly alwaysUp: {
      readonly name: "Always up";
      readonly brierScore: number | null;
      readonly logLoss: number | null;
      readonly clusteredBrierDelta: number | null;
    };
    readonly momentum: {
      readonly name: "Deterministic momentum";
      readonly brierScore: number | null;
      readonly logLoss: number | null;
      readonly clusteredBrierDelta: number | null;
    };
    readonly buyAndHold: {
      readonly name: "Eligible-universe buy and hold";
      readonly metricClass: "portfolio_comparator";
    };
  };
  readonly exclusionCounts: {
    readonly externallyUnverified: number;
    readonly failed: number;
    readonly fixtureOrRetrospective: number;
    readonly unresolved: number;
    readonly void: number;
  };
  readonly sampleAssessment: {
    readonly state: "insufficient_sample" | "comparison_ready";
    readonly superiorityClaimAllowed: boolean;
    readonly minimumForecasts: 100;
    readonly minimumDistinctDates: 20;
    readonly minimumPerActiveHorizon: 20;
    readonly warning: string | null;
  };
}
