import type {
  MarketBar,
  ProviderMarketData,
  SessionCalendar,
} from "@/modules/market/contracts";
import { createHash } from "node:crypto";

const DAY_MS = 86_400_000;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function source(sourceId: string, availableAt: string) {
  return {
    sourceId,
    sourceRevision: `${sourceId}-v1`,
    sourceHash: hash(`${sourceId}-v1`),
    availableAt,
  };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekdaySessions(count: number, start = "2025-01-02"): string[] {
  const sessions: string[] = [];
  let cursor = new Date(`${start}T12:00:00.000Z`);

  while (sessions.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) sessions.push(isoDate(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }

  return sessions;
}

function makeBars(
  symbol: string,
  sessions: readonly string[],
  startPrice: number,
  dailyStep: number,
): MarketBar[] {
  return sessions.map((session, index) => {
    const close = startPrice + dailyStep * index;
    const open = close - dailyStep * 0.35;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    const volume = 1_000_000 + index * 1_000;

    return {
      symbol,
      session,
      completed: true,
      ...source(
        `fixture:daily:${symbol}:${session}`,
        `${session}T21:30:00.000Z`,
      ),
      adjusted: { open, high, low, close, volume },
      unadjusted: { open, high, low, close, volume },
    };
  });
}

export interface FixtureOptions {
  sessionCount?: number;
  futureSessionCount?: number;
  start?: string;
}

export function buildMarketFixture(
  options: FixtureOptions = {},
): ProviderMarketData {
  const sessionCount = options.sessionCount ?? 300;
  const futureSessionCount = options.futureSessionCount ?? 10;
  const allSessions = weekdaySessions(
    sessionCount + futureSessionCount,
    options.start,
  );
  const completedSessions = allSessions.slice(0, sessionCount);
  const cutoffSession = completedSessions.at(-1)!;
  const calendar: SessionCalendar = {
    exchange: "XNAS",
    timezone: "America/New_York",
    sessions: allSessions,
    ...source("fixture:calendar:XNAS", `${cutoffSession}T20:00:00.000Z`),
  };

  return {
    provider: "fixture",
    requestedSessions: 300,
    fetchedAt: `${cutoffSession}T22:00:00.000Z`,
    sourceUpdatedAt: `${cutoffSession}T21:30:00.000Z`,
    ...source("fixture:response:ACME", `${cutoffSession}T21:30:00.000Z`),
    instrument: {
      symbol: "ACME",
      exchange: "XNAS",
      currency: "USD",
    },
    benchmark: {
      symbol: "BENCH",
      exchange: "XNAS",
      currency: "USD",
    },
    bars: makeBars("ACME", completedSessions, 80, 0.25),
    benchmarkBars: makeBars("BENCH", completedSessions, 300, 0.18),
    actions: [],
    benchmarkActions: [],
    calendar,
    eventCalendar: {
      symbol: "ACME",
      asOfSession: cutoffSession,
      completeThroughSession: allSessions.at(-1)!,
      ...source("fixture:events:ACME", `${cutoffSession}T21:45:00.000Z`),
      events: [
        {
          id: "earnings-next",
          type: "earnings",
          session: allSessions[sessionCount + 2]!,
          status: "confirmed",
        },
      ],
    },
  };
}

export function cutoffOf(input: ProviderMarketData): string {
  return input.bars.at(-1)!.session;
}
