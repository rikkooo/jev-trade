import type {
  FeatureHorizon,
  MarketBar,
  MarketFeatures,
  MovingAverageWindow,
  TrendDirection,
} from "../contracts";
import { FEATURE_HORIZONS, MOVING_AVERAGE_WINDOWS } from "../contracts";

const ANNUALIZATION_SESSIONS = 252;
const TREND_FLAT_BAND = 0.001;

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function simpleMovingAverage(
  values: readonly number[],
  window: number,
): number {
  return mean(values.slice(-window));
}

function periodReturn(values: readonly number[], sessions: number): number {
  const end = values.at(-1)!;
  return end / values[values.length - 1 - sessions]! - 1;
}

function trendDirection(value: number): TrendDirection {
  if (value > TREND_FLAT_BAND) return "up";
  if (value < -TREND_FLAT_BAND) return "down";
  return "flat";
}

export function wilderRsi(closes: readonly number[], period = 14): number {
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index]! - closes[index - 1]!;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index]! - closes[index - 1]!;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function wilderAtr(bars: readonly MarketBar[], period = 14): number {
  const trueRanges: number[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const current = bars[index]!.adjusted;
    const previousClose = bars[index - 1]!.adjusted.close;
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previousClose),
        Math.abs(current.low - previousClose),
      ),
    );
  }

  let atr = mean(trueRanges.slice(0, period));
  for (let index = period; index < trueRanges.length; index += 1) {
    atr = (atr * (period - 1) + trueRanges[index]!) / period;
  }
  return atr;
}

function logReturns(closes: readonly number[]): number[] {
  return closes
    .slice(1)
    .map((close, index) => Math.log(close / closes[index]!));
}

function rollingRealizedVolatility(
  closes: readonly number[],
  window = 20,
): number[] {
  const returns = logReturns(closes);
  const observations: number[] = [];
  for (let end = window; end <= returns.length; end += 1) {
    observations.push(
      sampleStandardDeviation(returns.slice(end - window, end)) *
        Math.sqrt(ANNUALIZATION_SESSIONS),
    );
  }
  return observations;
}

function gaps(bars: readonly MarketBar[]): number[] {
  return bars
    .slice(1)
    .map(
      (bar, index) => bar.unadjusted.open / bars[index]!.unadjusted.close - 1,
    );
}

function rollingAbsoluteMax(values: readonly number[], window = 20): number[] {
  const maxima: number[] = [];
  for (let end = window; end <= values.length; end += 1) {
    maxima.push(Math.max(...values.slice(end - window, end).map(Math.abs)));
  }
  return maxima;
}

export function percentileRank(
  observations: readonly number[],
  current: number,
): number {
  return (
    observations.filter((observation) => observation <= current).length /
    observations.length
  );
}

function finiteRecord<T extends number>(
  entries: Array<readonly [T, number]>,
): Record<T, number> {
  return Object.fromEntries(entries) as Record<T, number>;
}

export function calculateMarketFeatures(
  bars: readonly MarketBar[],
  benchmarkBars: readonly MarketBar[],
  sessionsToKnownEvent: number | null,
): MarketFeatures {
  const closes = bars.map((bar) => bar.adjusted.close);
  const benchmarkCloses = benchmarkBars.map((bar) => bar.adjusted.close);
  const returns = finiteRecord<FeatureHorizon>(
    FEATURE_HORIZONS.map((horizon) => [horizon, periodReturn(closes, horizon)]),
  );
  const trend = Object.fromEntries(
    FEATURE_HORIZONS.map((horizon) => [
      horizon,
      trendDirection(returns[horizon]),
    ]),
  ) as Record<FeatureHorizon, TrendDirection>;
  const currentClose = closes.at(-1)!;
  const movingAverageDistance = finiteRecord<MovingAverageWindow>(
    MOVING_AVERAGE_WINDOWS.map((window) => [
      window,
      currentClose / simpleMovingAverage(closes, window) - 1,
    ]),
  );
  const atr14 = wilderAtr(bars);
  const volatilities = rollingRealizedVolatility(closes);
  const currentVolatility = volatilities.at(-1)!;
  const trailingVolatilities = volatilities.slice(-ANNUALIZATION_SESSIONS);
  const allGaps = gaps(bars);
  const gapMaxima = rollingAbsoluteMax(allGaps);
  const largestAbsoluteGap20 = gapMaxima.at(-1)!;
  const trailingGapMaxima = gapMaxima.slice(-ANNUALIZATION_SESSIONS);
  const currentVolume = bars.at(-1)!.adjusted.volume;
  const volumeAverage20 = mean(
    bars.slice(-20).map((bar) => bar.adjusted.volume),
  );
  const trailing60 = closes.slice(-60);
  const drawdown60 = currentClose / Math.max(...trailing60) - 1;
  const relativeStrengthHorizons = [20, 60, 252] as const;
  const benchmarkReturns = finiteRecord<20 | 60 | 252>(
    relativeStrengthHorizons.map((horizon) => [
      horizon,
      periodReturn(benchmarkCloses, horizon),
    ]),
  );
  const relativeStrength = finiteRecord<20 | 60 | 252>(
    relativeStrengthHorizons.map((horizon) => [
      horizon,
      returns[horizon] - benchmarkReturns[horizon],
    ]),
  );
  const benchmarkAbove200 =
    benchmarkCloses.at(-1)! >= simpleMovingAverage(benchmarkCloses, 200);
  const benchmarkRegime = benchmarkAbove200
    ? benchmarkReturns[20] >= 0
      ? "risk_on"
      : "mixed"
    : benchmarkReturns[20] < 0
      ? "risk_off"
      : "mixed";

  return {
    returns,
    trend,
    movingAverageDistance,
    rsi14: wilderRsi(closes),
    atr14,
    normalizedAtr14: atr14 / currentClose,
    realizedVolatility20: currentVolatility,
    volatilityPercentile: percentileRank(
      trailingVolatilities,
      currentVolatility,
    ),
    drawdown60,
    volumeRegime: currentVolume / volumeAverage20,
    latestGap: allGaps.at(-1)!,
    largestAbsoluteGap20,
    gapRiskPercentile: percentileRank(trailingGapMaxima, largestAbsoluteGap20),
    relativeStrength,
    benchmarkReturns,
    benchmarkRegime,
    sessionsToKnownEvent,
  };
}
