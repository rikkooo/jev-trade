export interface MarketRiskInputs {
  volatilityPercentile: number;
  drawdown60: number;
  normalizedAtr14: number;
  gapRiskPercentile: number;
  sessionsToKnownEvent: number | null;
}

export type MarketRiskBand = "LOW" | "MEDIUM" | "HIGH";

export interface MarketRiskResult {
  index: number;
  band: MarketRiskBand;
  components: {
    volatility: number;
    drawdown: number;
    normalizedAtr: number;
    gap: number;
    eventProximity: number;
  };
  formulaVersion: "market-risk-v1";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampUnit(value: number): number {
  const bounded = clamp(value, 0, 1);
  if (bounded <= Number.EPSILON) return 0;
  if (bounded >= 1 - Number.EPSILON) return 1;
  return bounded;
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function eventProximityPoints(sessionsToKnownEvent: number | null): number {
  if (sessionsToKnownEvent === null) return 0;
  if (sessionsToKnownEvent <= 2) return 15;
  if (sessionsToKnownEvent <= 5) return 8;
  return 0;
}

export function classifyMarketRisk(index: number): MarketRiskBand {
  if (!Number.isFinite(index) || index < 0 || index > 100) {
    throw new Error(
      "DATA_INCOMPLETE: market-risk index must be finite and bounded",
    );
  }
  if (index <= 34) return "LOW";
  if (index <= 64) return "MEDIUM";
  return "HIGH";
}

export function computeMarketRisk(inputs: MarketRiskInputs): MarketRiskResult {
  const numeric = [
    inputs.volatilityPercentile,
    inputs.drawdown60,
    inputs.normalizedAtr14,
    inputs.gapRiskPercentile,
  ];
  if (!numeric.every(Number.isFinite)) {
    throw new Error("DATA_INCOMPLETE: market-risk input is not finite");
  }
  if (
    inputs.volatilityPercentile < 0 ||
    inputs.volatilityPercentile > 1 ||
    inputs.gapRiskPercentile < 0 ||
    inputs.gapRiskPercentile > 1 ||
    inputs.drawdown60 < -1 ||
    inputs.drawdown60 > 0 ||
    inputs.normalizedAtr14 < 0
  ) {
    throw new Error("DATA_INCOMPLETE: market-risk input is outside its domain");
  }
  if (
    inputs.sessionsToKnownEvent !== null &&
    (!Number.isInteger(inputs.sessionsToKnownEvent) ||
      inputs.sessionsToKnownEvent < 0)
  ) {
    throw new Error("DATA_INCOMPLETE: event proximity is invalid");
  }

  const components = {
    volatility: 35 * clampUnit(inputs.volatilityPercentile),
    drawdown: 20 * clamp(Math.abs(Math.min(inputs.drawdown60, 0)) / 0.2, 0, 1),
    normalizedAtr: 20 * clampUnit((inputs.normalizedAtr14 - 0.01) / 0.05),
    gap: 10 * clampUnit(inputs.gapRiskPercentile),
    eventProximity: eventProximityPoints(inputs.sessionsToKnownEvent),
  };
  const index = clamp(
    roundHalfAwayFromZero(
      components.volatility +
        components.drawdown +
        components.normalizedAtr +
        components.gap +
        components.eventProximity,
    ),
    0,
    100,
  );

  return {
    index,
    band: classifyMarketRisk(index),
    components,
    formulaVersion: "market-risk-v1",
  };
}

export function marketRiskFromFeatures(
  features: Pick<
    import("../market/contracts").MarketFeatures,
    | "volatilityPercentile"
    | "drawdown60"
    | "normalizedAtr14"
    | "gapRiskPercentile"
    | "sessionsToKnownEvent"
  >,
): MarketRiskResult {
  return computeMarketRisk(features);
}
