export type DisplayState =
  | "current"
  | "resolved"
  | "stale"
  | "incomplete"
  | "failed"
  | "void"
  | "corrected";

export type Direction = "up" | "flat" | "down";
export type ForecastMode = "POSITION" | "SPRINT";
export type MarketRiskBand = "LOW" | "MEDIUM" | "HIGH";

export interface ChartPoint {
  readonly session: string;
  readonly close: number;
  readonly volume: number;
}

export interface JudgmentView {
  readonly choice: Direction;
  readonly probabilities: Readonly<Record<Direction, number>>;
  readonly confidence: number;
  readonly confidenceLabel: "LOW" | "MEDIUM" | "HIGH";
  readonly setupQuality: number;
  readonly downsideHazard: number;
  readonly evidenceSufficiency: number;
}

export interface MarketRiskView {
  readonly index: number;
  readonly band: MarketRiskBand;
  readonly formulaVersion: "market-risk-v1";
  readonly components: readonly {
    readonly label: string;
    readonly value: number;
    readonly weight: number;
  }[];
}

export type PositionRiskView =
  | {
      readonly kind: "active";
      readonly entry: number;
      readonly stop: number;
      readonly shares: number;
      readonly capitalAtRisk: number;
      readonly maximumPlannedLoss: number;
      readonly notional: number;
      readonly currentPaperPnl: number;
      readonly equity: number;
      readonly formulaVersion: "position-risk-v1";
      readonly assumptions: string;
    }
  | {
      readonly kind: "not_applicable";
      readonly reason: string;
      readonly maximumPlannedLoss: 0;
    };

export interface GateTraceView {
  readonly order: number;
  readonly label: string;
  readonly result: "PASS" | "FAIL" | "NOT APPLICABLE";
  readonly detail: string;
}

export interface TimelineEventView {
  readonly at: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: "neutral" | "positive" | "warning" | "danger";
}

export interface ForecastView {
  readonly id: string;
  readonly symbol: string;
  readonly company: string;
  readonly mode: ForecastMode;
  readonly horizonSessions: 1 | 5 | 20;
  readonly neutralBandPercent: number;
  readonly cutoffAt: string;
  readonly latestMarketSession: string;
  readonly modelVersion: "typesafe/jev-1.13-20260917";
  readonly questionVersion: "jev-questions-v1";
  readonly policyVersion: "paper-policy-v1";
  readonly methodologyVersion: "methodology-v1.0";
  readonly decisionStateHash: string;
  readonly sourceReferenceCount: number;
  readonly sourceFreshness: string;
  readonly displayState: DisplayState;
  readonly forecastStatus: "PUBLISHED" | "RESOLVED" | "VOID";
  readonly prospectiveStatus: "FIXTURE — NOT SCORED";
  readonly action:
    "ENTER" | "HOLD" | "EXIT" | "WAIT" | "UP" | "FLAT" | "DOWN" | "PASS";
  readonly price: number;
  readonly sessionChangePercent: number;
  readonly judgment: JudgmentView;
  readonly marketRisk: MarketRiskView;
  readonly positionRisk: PositionRiskView;
  readonly chart: readonly ChartPoint[];
  readonly evidence: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly gates: readonly GateTraceView[];
  readonly timeline: readonly TimelineEventView[];
  readonly pickEligible: boolean;
  readonly stateMessage: string;
  readonly outcome?: {
    readonly label: Direction;
    readonly adjustedReturnPercent: number;
    readonly resolvedAt: string;
    readonly paperPnl?: number;
  };
  readonly correction?: {
    readonly at: string;
    readonly reason: string;
    readonly originalOutcome: Direction;
    readonly activeOutcome: Direction;
  };
  readonly voidReason?: string;
}

export interface StockSummaryView {
  readonly symbol: string;
  readonly company: string;
  readonly price: number;
  readonly sessionChangePercent: number;
  readonly action: ForecastView["action"] | "HIDDEN";
  readonly mode: ForecastMode;
  readonly horizonSessions: 1 | 5 | 20;
  readonly marketRiskBand: MarketRiskBand | null;
  readonly displayState: DisplayState;
  readonly forecastId: string;
  readonly blind: boolean;
  readonly dataKind: "synthetic_fixture";
}

export interface BlindRevealReference {
  readonly forecastId: string;
  readonly symbol: string;
}

export interface BlindStockPageView {
  readonly symbol: string;
  readonly company: string;
  readonly price: number;
  readonly sessionChangePercent: number;
  readonly displayState: DisplayState;
  readonly stateMessage: string;
  readonly chart: readonly ChartPoint[];
  readonly evidence: ForecastView["evidence"];
  readonly forecastId: string;
  readonly cutoffAt: string;
  readonly latestMarketSession: string;
  readonly modelVersion: ForecastView["modelVersion"];
  readonly policyVersion: ForecastView["policyVersion"];
  readonly sourceReferenceCount: number;
  readonly pickEligible: boolean;
  readonly reveal: BlindRevealReference;
}

export interface PortfolioView {
  readonly startingEquity: number;
  readonly equity: number;
  readonly cash: number;
  readonly exposure: number;
  readonly plannedLoss: number;
  readonly openPositions: readonly {
    readonly symbol: string;
    readonly forecastId: string;
    readonly shares: number;
    readonly entry: number;
    readonly mark: number;
    readonly stop: number;
    readonly paperPnl: number;
  }[];
  readonly events: readonly {
    readonly id: string;
    readonly at: string;
    readonly type: string;
    readonly symbol: string;
    readonly detail: string;
    readonly cashDelta: number;
  }[];
  readonly equityCurve: readonly {
    readonly session: string;
    readonly equity: number;
  }[];
}

export interface ScorecardView {
  readonly cohort: "fixture_demo_only";
  readonly prospectiveSampleSize: 0;
  readonly distinctResolutionDates: 0;
  readonly activeHorizons: 0;
  readonly lastRefresh: string;
  readonly scoringContract: {
    readonly version: "scorecard-v1";
    readonly minimumForecasts: 100;
    readonly minimumDistinctResolutionDates: 20;
    readonly minimumPerActiveHorizon: 20;
    readonly reliabilityMinimumBucketSize: 20;
    readonly lowSampleWarning: string;
  };
  readonly proof: {
    readonly evidenceClass: "fixture_manual_only";
    readonly externalAttestation: "absent";
    readonly prospectiveScorecardEligible: false;
  };
  readonly baselines: readonly {
    readonly id: "always_up" | "momentum_v1" | "eligible_buy_and_hold_v1";
    readonly label: string;
    readonly metricClass: "direction" | "portfolio";
  }[];
  readonly metrics: {
    readonly brierScore: null;
    readonly logLoss: null;
    readonly publicationSuccessRate: null;
    readonly coverageRate: null;
    readonly passRate: null;
    readonly hitRate: null;
    readonly paperReturn: null;
    readonly maximumDrawdown: null;
    readonly turnover: null;
  };
}
