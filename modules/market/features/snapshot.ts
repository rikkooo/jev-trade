import type {
  CorporateAction,
  EventCalendarStatus,
  IssuerEvent,
  MarketBar,
  MarketSnapshot,
  Ohlcv,
  ProviderMarketData,
} from "../contracts";
import { calculateMarketFeatures } from "./indicators";

export type MarketDataFailureCode =
  | "SYMBOL_NOT_ALLOWED"
  | "INVALID_REQUEST"
  | "INVALID_IDENTITY"
  | "INVALID_CALENDAR"
  | "DUPLICATE_BAR"
  | "MISSING_SESSION"
  | "PARTIAL_BAR"
  | "NONFINITE_VALUE"
  | "INVALID_OHLC"
  | "STALE_BAR"
  | "STALE_SOURCE"
  | "INSUFFICIENT_HISTORY"
  | "BENCHMARK_MISMATCH"
  | "ACTION_AMBIGUITY"
  | "RECENT_SPLIT"
  | "STALE_EVENT_CALENDAR";

export class MarketDataValidationError extends Error {
  constructor(
    readonly code: MarketDataFailureCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "MarketDataValidationError";
  }
}

export interface BuildMarketSnapshotOptions {
  allowlistedSymbols: readonly string[];
  cutoffSession: string;
  minimumSessions?: number;
  recentSplitWindow?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(code: MarketDataFailureCode, message: string): never {
  throw new MarketDataValidationError(code, message);
}

function isIsoSession(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return (
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

function isIsoInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validateCalendar(input: ProviderMarketData, cutoff: string): string[] {
  if (
    input.calendar.exchange !== input.instrument.exchange ||
    input.calendar.timezone !== "America/New_York"
  ) {
    fail("INVALID_CALENDAR", "instrument, benchmark, and calendar must align");
  }
  const seen = new Set<string>();
  let previous = "";
  for (const session of input.calendar.sessions) {
    if (!isIsoSession(session) || seen.has(session) || session <= previous) {
      fail("INVALID_CALENDAR", "sessions must be unique ascending ISO dates");
    }
    const day = new Date(`${session}T00:00:00.000Z`).getUTCDay();
    if (day === 0 || day === 6) {
      fail("INVALID_CALENDAR", "a US equity session cannot fall on a weekend");
    }
    seen.add(session);
    previous = session;
  }
  if (!seen.has(cutoff)) fail("INVALID_CALENDAR", "cutoff is not a session");
  return input.calendar.sessions;
}

function validateOhlcv(value: Ohlcv, label: string): void {
  const numbers = [
    value.open,
    value.high,
    value.low,
    value.close,
    value.volume,
  ];
  if (!numbers.every(Number.isFinite)) {
    fail("NONFINITE_VALUE", `${label} contains a non-finite number`);
  }
  if (
    value.open <= 0 ||
    value.high <= 0 ||
    value.low <= 0 ||
    value.close <= 0 ||
    value.volume < 0 ||
    value.high < Math.max(value.open, value.close) ||
    value.low > Math.min(value.open, value.close)
  ) {
    fail("INVALID_OHLC", `${label} violates price or volume invariants`);
  }
}

function validateBars(
  bars: readonly MarketBar[],
  symbol: string,
  cutoff: string,
  calendar: readonly string[],
  minimumSessions: number,
): MarketBar[] {
  const atCutoff = bars.filter((bar) => bar.session <= cutoff);
  const seen = new Set<string>();
  let previous = "";
  for (const bar of atCutoff) {
    if (bar.symbol !== symbol || !isIsoSession(bar.session)) {
      fail("INVALID_IDENTITY", `bar identity is invalid for ${symbol}`);
    }
    if (!bar.sourceRevision) {
      fail(
        "INVALID_IDENTITY",
        `${symbol} ${bar.session} has no source revision`,
      );
    }
    if (seen.has(bar.session))
      fail("DUPLICATE_BAR", `duplicate ${bar.session}`);
    if (bar.session <= previous) {
      fail("MISSING_SESSION", "bars must follow calendar order");
    }
    if (!bar.completed) fail("PARTIAL_BAR", `${bar.session} is not completed`);
    validateOhlcv(bar.adjusted, `${symbol} ${bar.session} adjusted`);
    validateOhlcv(bar.unadjusted, `${symbol} ${bar.session} unadjusted`);
    seen.add(bar.session);
    previous = bar.session;
  }
  if (atCutoff.at(-1)?.session !== cutoff) {
    fail("STALE_BAR", `${symbol} has no completed bar at cutoff`);
  }
  if (atCutoff.length < minimumSessions) {
    fail(
      "INSUFFICIENT_HISTORY",
      `${symbol} has fewer than ${minimumSessions} sessions`,
    );
  }
  const firstSession = atCutoff[0]!.session;
  const expected = calendar.filter(
    (session) => session >= firstSession && session <= cutoff,
  );
  if (
    expected.length !== atCutoff.length ||
    expected.some((session, index) => atCutoff[index]!.session !== session)
  ) {
    fail("MISSING_SESSION", `${symbol} does not match the exchange calendar`);
  }
  return structuredClone(atCutoff);
}

function validateActions(
  actions: readonly CorporateAction[],
  symbol: string,
  cutoff: string,
  selectedSessions: readonly string[],
  recentSplitWindow: number,
): CorporateAction[] {
  const selected = actions.filter(
    (action) => action.effectiveSession <= cutoff,
  );
  const seen = new Set<string>();
  const recentSessions = new Set(
    recentSplitWindow > 0 ? selectedSessions.slice(-recentSplitWindow) : [],
  );
  for (const action of selected) {
    if (
      action.symbol !== symbol ||
      seen.has(action.id) ||
      action.status !== "confirmed" ||
      action.adjustmentStatus !== "verified" ||
      !isIsoSession(action.effectiveSession) ||
      !action.sourceRevision
    ) {
      fail("ACTION_AMBIGUITY", `corporate action ${action.id} is not verified`);
    }
    if (
      action.type === "split" &&
      (!Number.isFinite(action.splitRatio) || action.splitRatio <= 0)
    ) {
      fail("ACTION_AMBIGUITY", `split ${action.id} has an invalid ratio`);
    }
    if (action.type === "halt" || action.type === "delisting") {
      fail("ACTION_AMBIGUITY", `${action.type} blocks a complete snapshot`);
    }
    if (
      action.type === "split" &&
      recentSessions.has(action.effectiveSession)
    ) {
      fail("RECENT_SPLIT", `split ${action.id} falls in the exclusion window`);
    }
    seen.add(action.id);
  }
  return structuredClone(selected);
}

function validateEventCalendar(
  status: EventCalendarStatus,
  symbol: string,
  cutoff: string,
  calendar: readonly string[],
): Array<IssuerEvent & { sessionsAway: number }> {
  if (status.symbol !== symbol || status.asOfSession !== cutoff) {
    fail("STALE_EVENT_CALENDAR", "event status is not frozen at the cutoff");
  }
  if (!isIsoSession(status.completeThroughSession) || !status.sourceRevision) {
    fail("STALE_EVENT_CALENDAR", "event status has no valid coverage revision");
  }
  const cutoffIndex = calendar.indexOf(cutoff);
  const fifthFutureSession = calendar[cutoffIndex + 5];
  if (
    !fifthFutureSession ||
    status.completeThroughSession < fifthFutureSession
  ) {
    fail(
      "STALE_EVENT_CALENDAR",
      "event status does not cover five future sessions",
    );
  }
  const seen = new Set<string>();
  return status.events
    .filter((event) => event.session > cutoff)
    .map((event) => {
      const eventIndex = calendar.indexOf(event.session);
      if (
        seen.has(event.id) ||
        event.status !== "confirmed" ||
        eventIndex < 0 ||
        event.session > status.completeThroughSession
      ) {
        fail(
          "STALE_EVENT_CALENDAR",
          `event ${event.id} is not a known covered event`,
        );
      }
      seen.add(event.id);
      return { ...event, sessionsAway: eventIndex - cutoffIndex };
    })
    .sort((left, right) => {
      if (left.session !== right.session)
        return left.session < right.session ? -1 : 1;
      if (left.id === right.id) return 0;
      return left.id < right.id ? -1 : 1;
    });
}

function assertFiniteFeatures(value: unknown, path = "features"): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    fail("NONFINITE_VALUE", `${path} is not finite`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertFiniteFeatures(entry, `${path}.${index}`),
    );
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) =>
      assertFiniteFeatures(entry, `${path}.${key}`),
    );
  }
}

export function buildMarketSnapshot(
  input: ProviderMarketData,
  options: BuildMarketSnapshotOptions,
): MarketSnapshot {
  const cutoff = options.cutoffSession;
  const minimumSessions = Math.max(options.minimumSessions ?? 272, 272);
  const recentSplitWindow = options.recentSplitWindow ?? 20;
  if (
    !isIsoSession(cutoff) ||
    !Number.isInteger(input.requestedSessions) ||
    input.requestedSessions < 300
  ) {
    fail(
      "INVALID_REQUEST",
      "cutoff must be ISO and adapters must request 300 sessions",
    );
  }
  const allowlist = new Set(
    options.allowlistedSymbols.map((symbol) => symbol.toUpperCase()),
  );
  if (!allowlist.has(input.instrument.symbol)) {
    fail("SYMBOL_NOT_ALLOWED", `${input.instrument.symbol} is not allowlisted`);
  }
  if (
    !input.provider ||
    !input.calendar.sourceRevision ||
    !input.instrument.symbol ||
    !input.benchmark.symbol ||
    input.instrument.symbol === input.benchmark.symbol
  ) {
    fail("INVALID_IDENTITY", "instrument or benchmark identity is invalid");
  }
  if (
    input.instrument.currency !== input.benchmark.currency ||
    input.instrument.exchange !== input.benchmark.exchange
  ) {
    fail(
      "BENCHMARK_MISMATCH",
      "benchmark identity does not align with the symbol",
    );
  }
  if (!isIsoInstant(input.fetchedAt) || !isIsoInstant(input.sourceUpdatedAt)) {
    fail("STALE_SOURCE", "provider timestamps are invalid");
  }
  if (
    input.fetchedAt.slice(0, 10) < cutoff ||
    input.sourceUpdatedAt.slice(0, 10) < cutoff
  ) {
    fail("STALE_SOURCE", "provider source predates the cutoff session");
  }

  const calendar = validateCalendar(input, cutoff);
  const bars = validateBars(
    input.bars,
    input.instrument.symbol,
    cutoff,
    calendar,
    minimumSessions,
  );
  const benchmarkBars = validateBars(
    input.benchmarkBars,
    input.benchmark.symbol,
    cutoff,
    calendar,
    minimumSessions,
  );
  if (
    bars.length !== benchmarkBars.length ||
    bars.some((bar, index) => benchmarkBars[index]!.session !== bar.session)
  ) {
    fail("BENCHMARK_MISMATCH", "symbol and benchmark sessions do not align");
  }
  const sessions = bars.map((bar) => bar.session);
  const actions = validateActions(
    input.actions,
    input.instrument.symbol,
    cutoff,
    sessions,
    recentSplitWindow,
  );
  const benchmarkActions = validateActions(
    input.benchmarkActions,
    input.benchmark.symbol,
    cutoff,
    sessions,
    0,
  );
  const upcomingEvents = validateEventCalendar(
    input.eventCalendar,
    input.instrument.symbol,
    cutoff,
    calendar,
  );
  const sessionsToKnownEvent = upcomingEvents.at(0)?.sessionsAway ?? null;
  const features = calculateMarketFeatures(
    bars,
    benchmarkBars,
    sessionsToKnownEvent,
  );
  assertFiniteFeatures(features);

  const compactState = {
    schemaVersion: "market-state-v1" as const,
    symbol: input.instrument.symbol,
    benchmarkSymbol: input.benchmark.symbol,
    cutoffSession: cutoff,
    latestAdjustedClose: bars.at(-1)!.adjusted.close,
    features,
    upcomingKnownEvents: upcomingEvents.map((event) => ({
      type: event.type,
      session: event.session,
      sessionsAway: event.sessionsAway,
    })),
    staleness: "fresh" as const,
    missingData: [] as [],
  };

  return {
    schemaVersion: "market-snapshot-v1",
    provider: input.provider,
    instrument: structuredClone(input.instrument),
    benchmark: structuredClone(input.benchmark),
    cutoffSession: cutoff,
    calendarRevision: input.calendar.sourceRevision,
    eventCalendarRevision: input.eventCalendar.sourceRevision,
    bars,
    benchmarkBars,
    actions,
    benchmarkActions,
    features,
    compactState,
  };
}
