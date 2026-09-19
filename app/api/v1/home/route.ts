import {
  FIXTURE_AUDIT_FORECASTS,
  FIXTURE_FORECASTS,
  FIXTURE_PORTFOLIO,
  FIXTURE_SCORECARD,
  getUniverse,
} from "@/modules/view-model";

import { fixtureJson } from "../_lib/responses";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const symbols = getUniverse();
  return fixtureJson({
    dataKind: "synthetic_fixture",
    freshness: {
      generatedAt: FIXTURE_SCORECARD.lastRefresh,
      latestMarketSession:
        symbols
          .map((symbol) => symbol.latestMarketSession)
          .sort()
          .at(-1) ?? null,
    },
    latestForecasts: symbols.filter(
      (symbol) => symbol.displayState === "current",
    ),
    recentlyResolved: symbols.filter((symbol) =>
      ["resolved", "corrected", "void"].includes(symbol.displayState),
    ),
    portfolio: FIXTURE_PORTFOLIO,
    scorecard: FIXTURE_SCORECARD,
    forecastCount: FIXTURE_AUDIT_FORECASTS.length,
    symbolCount: FIXTURE_FORECASTS.length,
    forecastIndex: FIXTURE_AUDIT_FORECASTS.map(
      ({ id, symbol, cutoffAt, pickEligible }) => ({
        id,
        symbol,
        cutoffAt,
        publicAuditRoute: !pickEligible,
      }),
    ),
  });
}
