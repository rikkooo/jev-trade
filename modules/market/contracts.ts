export type IsoSession = string;

export interface Ohlcv {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketBar {
  symbol: string;
  session: IsoSession;
  completed: boolean;
  sourceRevision: string;
  adjusted: Ohlcv;
  unadjusted: Ohlcv;
}

export interface InstrumentIdentity {
  symbol: string;
  exchange: string;
  currency: string;
}

export type CorporateAction =
  | {
      id: string;
      symbol: string;
      type: "split";
      effectiveSession: IsoSession;
      status: "confirmed" | "estimated";
      splitRatio: number;
      adjustmentStatus: "verified" | "ambiguous";
      sourceRevision: string;
    }
  | {
      id: string;
      symbol: string;
      type: "cash_dividend" | "halt" | "delisting";
      effectiveSession: IsoSession;
      status: "confirmed" | "estimated";
      adjustmentStatus: "verified" | "ambiguous";
      sourceRevision: string;
    };

export interface SessionCalendar {
  exchange: string;
  timezone: "America/New_York";
  sessions: IsoSession[];
  sourceRevision: string;
}

export interface IssuerEvent {
  id: string;
  type: "earnings" | "investor_day" | "shareholder_meeting" | "other";
  session: IsoSession;
  status: "confirmed" | "estimated";
}

export interface EventCalendarStatus {
  symbol: string;
  asOfSession: IsoSession;
  completeThroughSession: IsoSession;
  sourceRevision: string;
  events: IssuerEvent[];
}

export interface ProviderMarketData {
  provider: string;
  requestedSessions: number;
  fetchedAt: string;
  sourceUpdatedAt: string;
  instrument: InstrumentIdentity;
  benchmark: InstrumentIdentity;
  bars: MarketBar[];
  benchmarkBars: MarketBar[];
  actions: CorporateAction[];
  benchmarkActions: CorporateAction[];
  calendar: SessionCalendar;
  eventCalendar: EventCalendarStatus;
}

export interface MarketDataRequest {
  symbol: string;
  benchmarkSymbol: string;
  cutoffSession: IsoSession;
  sessions: number;
}

export interface MarketDataProvider {
  readonly id: string;
  fetchMarketData(request: MarketDataRequest): Promise<ProviderMarketData>;
}

export const FEATURE_HORIZONS = [1, 5, 20, 60, 252] as const;
export type FeatureHorizon = (typeof FEATURE_HORIZONS)[number];
export const MOVING_AVERAGE_WINDOWS = [20, 50, 200] as const;
export type MovingAverageWindow = (typeof MOVING_AVERAGE_WINDOWS)[number];
export type TrendDirection = "up" | "flat" | "down";

export interface MarketFeatures {
  returns: Record<FeatureHorizon, number>;
  trend: Record<FeatureHorizon, TrendDirection>;
  movingAverageDistance: Record<MovingAverageWindow, number>;
  rsi14: number;
  atr14: number;
  normalizedAtr14: number;
  realizedVolatility20: number;
  volatilityPercentile: number;
  drawdown60: number;
  volumeRegime: number;
  latestGap: number;
  largestAbsoluteGap20: number;
  gapRiskPercentile: number;
  relativeStrength: Record<20 | 60 | 252, number>;
  benchmarkReturns: Record<20 | 60 | 252, number>;
  benchmarkRegime: "risk_on" | "mixed" | "risk_off";
  sessionsToKnownEvent: number | null;
}

export interface CompactMarketState {
  schemaVersion: "market-state-v1";
  symbol: string;
  benchmarkSymbol: string;
  cutoffSession: IsoSession;
  latestAdjustedClose: number;
  features: MarketFeatures;
  upcomingKnownEvents: Array<{
    type: IssuerEvent["type"];
    session: IsoSession;
    sessionsAway: number;
  }>;
  staleness: "fresh";
  missingData: [];
}

export interface MarketSnapshot {
  schemaVersion: "market-snapshot-v1";
  provider: string;
  instrument: InstrumentIdentity;
  benchmark: InstrumentIdentity;
  cutoffSession: IsoSession;
  calendarRevision: string;
  eventCalendarRevision: string;
  bars: MarketBar[];
  benchmarkBars: MarketBar[];
  actions: CorporateAction[];
  benchmarkActions: CorporateAction[];
  features: MarketFeatures;
  compactState: CompactMarketState;
}
