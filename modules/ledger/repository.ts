import type {
  AnalyticsEvent,
  Forecast,
  ForecastEvent,
  ForecastOutcome,
  ForecastResolution,
  IdempotentResult,
  JobAttempt,
  JudgmentRun,
  LedgerProjection,
  LedgerState,
  MarketSnapshot,
  PaperEvent,
  PolicyDecision,
  ProcessorTerms,
  ProviderRights,
  VisitorPick,
} from "./types";

export interface LedgerRepository {
  insertSnapshot(
    input: Omit<MarketSnapshot, "contentHash" | "createdAt">,
  ): MarketSnapshot;
  insertJudgment(
    input: Omit<JudgmentRun, "contentHash" | "createdAt">,
  ): JudgmentRun;
  insertPolicyDecision(
    input: Omit<PolicyDecision, "contentHash" | "createdAt">,
  ): PolicyDecision;
  publishForecast(
    input: Omit<Forecast, "createdAt">,
  ): IdempotentResult<Forecast>;
  resolveForecast(input: {
    readonly event: Omit<
      ForecastEvent,
      "createdAt" | "type" | "referencesEventId"
    > & {
      readonly type: "resolved";
    };
    readonly outcome: Omit<
      ForecastOutcome,
      "createdAt" | "correctionOfOutcomeId" | "correctionReason"
    >;
  }): IdempotentResult<ForecastResolution>;
  correctForecastOutcome(input: {
    readonly event: Omit<ForecastEvent, "createdAt" | "type"> & {
      readonly type: "correction";
      readonly referencesEventId: string;
      readonly reason: string;
    };
    readonly outcome: Omit<ForecastOutcome, "createdAt"> & {
      readonly correctionOfOutcomeId: string;
      readonly correctionReason: string;
    };
  }): IdempotentResult<ForecastResolution>;
  voidForecast(
    input: Omit<ForecastEvent, "createdAt" | "type" | "referencesEventId"> & {
      readonly type: "void";
    },
  ): IdempotentResult<ForecastEvent>;
  appendPaperEvent(input: Omit<PaperEvent, "createdAt">): PaperEvent;
  recordJobAttempt(
    input: Omit<JobAttempt, "createdAt">,
  ): IdempotentResult<JobAttempt>;
  recordVisitorPick(input: {
    readonly id: string;
    readonly forecastId: string;
    readonly visitorToken: string;
    readonly choice: VisitorPick["choice"];
    readonly expiresAt: string;
  }): IdempotentResult<VisitorPick>;
  recordAnalyticsEvent(input: {
    readonly id: string;
    readonly event: AnalyticsEvent["event"];
    readonly consent: boolean;
    readonly browserToken: string;
    readonly expiresAt: string;
    readonly symbol?: string;
    readonly forecastId?: string;
  }): AnalyticsEvent | null;
  appendProviderRights(
    input: Omit<ProviderRights, "createdAt">,
  ): ProviderRights;
  appendProcessorTerms(
    input: Omit<ProcessorTerms, "createdAt">,
  ): ProcessorTerms;
  projection(): LedgerProjection;
  readAll(): LedgerState;
}
