import type { EquityPoint, PaperMetricInput, PaperMetrics } from "./types";

function validateCurve(curve: readonly EquityPoint[]): void {
  if (curve.length < 2) {
    throw new Error("paper metrics require at least two equity observations");
  }
  let previousDate = "";
  for (const point of curve) {
    if (point.date <= previousDate) {
      throw new Error("equity dates must be strictly increasing");
    }
    if (!Number.isFinite(point.equity) || point.equity <= 0) {
      throw new Error("equity values must be positive and finite");
    }
    previousDate = point.date;
  }
}

export function computeMaximumDrawdown(
  equityCurve: readonly EquityPoint[],
): number {
  validateCurve(equityCurve);
  let peak = equityCurve[0]?.equity as number;
  let maximumDrawdown = 0;
  for (const { equity } of equityCurve) {
    peak = Math.max(peak, equity);
    maximumDrawdown = Math.max(maximumDrawdown, (peak - equity) / peak);
  }
  return maximumDrawdown;
}

export function computePaperMetrics(input: PaperMetricInput): PaperMetrics {
  validateCurve(input.equityCurve);
  if (input.scorecardForecastIds.length === 0) {
    throw new Error("paper metric cohort cannot be empty");
  }
  if (
    new Set(input.scorecardForecastIds).size !==
      input.scorecardForecastIds.length ||
    new Set(input.paperForecastIds).size !== input.paperForecastIds.length
  ) {
    throw new Error("paper metric cohort forecast IDs must be unique");
  }
  const scorecardIds = [...input.scorecardForecastIds].sort();
  const paperIds = [...input.paperForecastIds].sort();
  if (JSON.stringify(scorecardIds) !== JSON.stringify(paperIds)) {
    throw new Error("paper metrics must use the verified scorecard cohort");
  }
  if (!Number.isFinite(input.tradedNotional) || input.tradedNotional < 0) {
    throw new Error("traded notional must be finite and non-negative");
  }

  const first = input.equityCurve[0]?.equity as number;
  const last = input.equityCurve.at(-1)?.equity as number;
  const averageEquity =
    input.equityCurve.reduce((total, point) => total + point.equity, 0) /
    input.equityCurve.length;
  return {
    returnRate: last / first - 1,
    maximumDrawdown: computeMaximumDrawdown(input.equityCurve),
    turnover: input.tradedNotional / averageEquity,
  };
}
