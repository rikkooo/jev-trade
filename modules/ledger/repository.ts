import type {
  AnalyticsEvent,
  Forecast,
  ForecastEvent,
  ForecastOutcome,
  IdempotentResult,
  JobAttempt,
  JudgmentRun,
  LedgerProjection,
  LedgerState,
  MarketSnapshot,
  PaperEvent,
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
  publishForecast(
    input: Omit<Forecast, "createdAt">,
  ): IdempotentResult<Forecast>;
  appendForecastEvent(
    input: Omit<ForecastEvent, "id" | "createdAt"> & { readonly id?: string },
  ): ForecastEvent;
  appendOutcome(input: Omit<ForecastOutcome, "createdAt">): ForecastOutcome;
  appendPaperEvent(input: Omit<PaperEvent, "createdAt">): PaperEvent;
  recordJobAttempt(input: Omit<JobAttempt, "createdAt">): JobAttempt;
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
