import type { CompactMarketState } from "@/modules/market/contracts";

export function buildDemoCompactState(): CompactMarketState {
  return {
    schemaVersion: "market-state-v1",
    symbol: "ACME",
    benchmarkSymbol: "BENCH",
    cutoffSession: "2026-09-18",
    latestAdjustedClose: 147.75,
    features: {
      returns: { 1: 0.01, 5: 0.03, 20: 0.08, 60: 0.14, 252: 0.28 },
      trend: { 1: "up", 5: "up", 20: "up", 60: "up", 252: "up" },
      movingAverageDistance: { 20: 0.03, 50: 0.07, 200: 0.18 },
      rsi14: 61,
      atr14: 3.1,
      normalizedAtr14: 0.021,
      realizedVolatility20: 0.25,
      volatilityPercentile: 0.65,
      drawdown60: -0.04,
      volumeRegime: 1.18,
      latestGap: 0.004,
      largestAbsoluteGap20: 0.03,
      gapRiskPercentile: 0.42,
      relativeStrength: { 20: 0.04, 60: 0.08, 252: 0.12 },
      benchmarkReturns: { 20: 0.04, 60: 0.09, 252: 0.16 },
      benchmarkRegime: "risk_on",
      sessionsToKnownEvent: 8,
    },
    upcomingKnownEvents: [
      { type: "earnings", session: "2026-09-30", sessionsAway: 8 },
    ],
    staleness: "fresh",
    missingData: [],
  };
}
