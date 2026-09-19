import type { JsonValue } from "./canonical-json";

export type IsoDateTime = string;
export type ForecastMode = "position" | "sprint";
export type ForecastStatus = "published" | "resolved" | "void";
export type Direction = "up" | "flat" | "down";

export type SnapshotSourceReference = {
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly sourceHash: string;
  readonly availableAt: IsoDateTime;
};

export interface MarketSnapshot {
  readonly id: string;
  readonly symbol: string;
  readonly provider: string;
  readonly cutoffAt: IsoDateTime;
  readonly knowledgeCutoffAt: IsoDateTime;
  readonly providerFetchedAt: IsoDateTime;
  readonly sourceUpdatedAt: IsoDateTime;
  readonly latestMarketSession: string;
  readonly sourceManifest: readonly SnapshotSourceReference[];
  readonly state: JsonValue;
  readonly contentHash: string;
  readonly createdAt: IsoDateTime;
}

export interface PolicyDecision {
  readonly id: string;
  readonly judgmentId: string;
  readonly policyVersion: string;
  readonly action:
    "enter" | "hold" | "exit" | "wait" | "up" | "flat" | "down" | "pass";
  readonly gateTrace: JsonValue;
  readonly sizing?: JsonValue;
  readonly contentHash: string;
  readonly createdAt: IsoDateTime;
}

export interface JudgmentRun {
  readonly id: string;
  readonly snapshotId: string;
  readonly provider: string;
  readonly modelVersion: string;
  readonly questionVersion: string;
  readonly answers: JsonValue;
  readonly contentHash: string;
  readonly createdAt: IsoDateTime;
}

export interface Forecast {
  readonly id: string;
  readonly publicationKey: string;
  readonly snapshotId: string;
  readonly judgmentId: string;
  readonly policyDecisionId: string;
  readonly symbol: string;
  readonly mode: ForecastMode;
  readonly horizonSessions: number;
  readonly cutoffAt: IsoDateTime;
  readonly latestMarketSession: string;
  readonly modelVersion: string;
  readonly questionVersion: string;
  readonly policyVersion: string;
  readonly deploymentSha: string;
  readonly createdAt: IsoDateTime;
}

export interface ForecastEvent {
  readonly id: string;
  readonly forecastId: string;
  readonly type: "published" | "resolved" | "void" | "correction";
  readonly reason?: string;
  readonly referencesEventId?: string;
  readonly createdAt: IsoDateTime;
}

export interface ForecastOutcome {
  readonly id: string;
  readonly forecastId: string;
  readonly realizedLabel: Direction;
  readonly adjustedReturn: number;
  readonly brierScore?: number;
  readonly logLoss?: number;
  readonly sourceBarHash: string;
  readonly correctionOfOutcomeId?: string;
  readonly correctionReason?: string;
  readonly createdAt: IsoDateTime;
}

export interface ForecastResolution {
  readonly event: ForecastEvent;
  readonly outcome: ForecastOutcome;
}

export type PaperEventType =
  | "deposit"
  | "entry"
  | "mark"
  | "split"
  | "cash_dividend"
  | "stop"
  | "exit"
  | "expiry"
  | "correction"
  | "void";

export interface PaperEvent {
  readonly id: string;
  readonly type: PaperEventType;
  readonly symbol?: string;
  readonly forecastId?: string;
  readonly cashDelta: number;
  readonly sharesDelta: number;
  readonly price?: number;
  readonly correctionOfEventId?: string;
  readonly reason?: string;
  readonly createdAt: IsoDateTime;
}

export interface JobAttempt {
  readonly id: string;
  readonly operationKey: string;
  readonly attemptNumber: number;
  readonly terminalStatus: "succeeded" | "failed";
  readonly errorCode?: string;
  readonly createdAt: IsoDateTime;
}

export interface VisitorPick {
  readonly id: string;
  readonly forecastId: string;
  readonly choice: Direction;
  readonly createdAt: IsoDateTime;
}

export interface VisitorPickResult {
  readonly id: string;
  readonly visitorPickId: string;
  readonly recordedOutcomeId: string;
  readonly activeOutcomeId: string;
  readonly correct: boolean;
  readonly createdAt: IsoDateTime;
}

export type AnalyticsEventName =
  "stock_view" | "pick" | "reveal" | "return" | "share";

export interface AnalyticsEvent {
  readonly id: string;
  readonly event: AnalyticsEventName;
  readonly symbol?: string;
  readonly forecastId?: string;
  readonly createdAt: IsoDateTime;
}

export interface PrivateIdentifier {
  readonly id: string;
  readonly kind: "analytics" | "visitor_pick";
  readonly digest: string;
  readonly scope: string;
  readonly recordId: string;
  readonly expiresAt: IsoDateTime;
  readonly createdAt: IsoDateTime;
}

export interface ProviderRights {
  readonly id: string;
  readonly provider: string;
  readonly planOrContract: string;
  readonly permittedFields: readonly string[];
  readonly audience: "public" | "private";
  readonly retention: string;
  readonly attribution: string;
  readonly derivedOutputs: boolean;
  readonly screenshotsAndVideo: boolean;
  readonly onwardAiProcessing: boolean;
  readonly effectiveFrom: IsoDateTime;
  readonly effectiveTo?: IsoDateTime;
  readonly reviewedBy: string;
  readonly createdAt: IsoDateTime;
}

export interface ProcessorTerms {
  readonly id: string;
  readonly processor: string;
  readonly retention: string;
  readonly training: string;
  readonly residency: string;
  readonly deletion: string;
  readonly effectiveFrom: IsoDateTime;
  readonly effectiveTo?: IsoDateTime;
  readonly reviewedBy: string;
  readonly createdAt: IsoDateTime;
}

export interface LedgerState {
  readonly snapshots: readonly MarketSnapshot[];
  readonly judgments: readonly JudgmentRun[];
  readonly policyDecisions: readonly PolicyDecision[];
  readonly forecasts: readonly Forecast[];
  readonly forecastEvents: readonly ForecastEvent[];
  readonly outcomes: readonly ForecastOutcome[];
  readonly paperEvents: readonly PaperEvent[];
  readonly jobAttempts: readonly JobAttempt[];
  readonly visitorPicks: readonly VisitorPick[];
  readonly analyticsEvents: readonly AnalyticsEvent[];
  readonly providerRights: readonly ProviderRights[];
  readonly processorTerms: readonly ProcessorTerms[];
}

export interface LedgerProjection {
  readonly forecastStatusById: Readonly<Record<string, ForecastStatus>>;
  readonly activeOutcomeByForecast: Readonly<Record<string, ForecastOutcome>>;
  readonly cash: number;
  readonly sharesBySymbol: Readonly<Record<string, number>>;
}

export interface IdempotentResult<T> {
  readonly created: boolean;
  readonly value: T;
}
