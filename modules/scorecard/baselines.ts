import { computeMaximumDrawdown } from "./paper";
import type {
  BuyAndHoldObservation,
  BuyAndHoldResult,
  DirectionDistribution,
  ScoreDirection,
} from "./types";

export function oneHotDistribution(
  direction: ScoreDirection,
): DirectionDistribution {
  return {
    up: direction === "up" ? 1 : 0,
    flat: direction === "flat" ? 1 : 0,
    down: direction === "down" ? 1 : 0,
  };
}

export function alwaysUpDistribution(): DirectionDistribution {
  return oneHotDistribution("up");
}

export function momentumDistribution(
  trailingReturn: number,
  neutralBand: number,
): DirectionDistribution {
  if (!Number.isFinite(trailingReturn)) {
    throw new Error("momentum trailing return must be finite");
  }
  if (!Number.isFinite(neutralBand) || neutralBand < 0) {
    throw new Error("momentum neutral band must be finite and non-negative");
  }
  const direction =
    trailingReturn > neutralBand
      ? "up"
      : trailingReturn < -neutralBand
        ? "down"
        : "flat";
  return oneHotDistribution(direction);
}

export function computeEligibleUniverseBuyAndHold(input: {
  readonly startingEquity: number;
  readonly observations: readonly BuyAndHoldObservation[];
}): BuyAndHoldResult {
  if (!Number.isFinite(input.startingEquity) || input.startingEquity <= 0) {
    throw new Error("buy-and-hold starting equity must be positive and finite");
  }
  if (input.observations.length < 2) {
    throw new Error("buy-and-hold requires at least two dated observations");
  }
  const first = input.observations[0];
  if (!first) throw new Error("buy-and-hold first observation is missing");
  const symbols = Object.keys(first.adjustedCloseBySymbol).sort();
  if (symbols.length === 0) {
    throw new Error("buy-and-hold eligible universe cannot be empty");
  }

  let previousDate = "";
  for (const observation of input.observations) {
    if (observation.date <= previousDate) {
      throw new Error("buy-and-hold dates must be strictly increasing");
    }
    previousDate = observation.date;
    const observedSymbols = Object.keys(
      observation.adjustedCloseBySymbol,
    ).sort();
    if (JSON.stringify(observedSymbols) !== JSON.stringify(symbols)) {
      throw new Error("buy-and-hold universe must remain frozen across dates");
    }
    for (const symbol of symbols) {
      const price = observation.adjustedCloseBySymbol[symbol];
      if (price === undefined || !Number.isFinite(price) || price <= 0) {
        throw new Error(`buy-and-hold price for ${symbol} must be positive`);
      }
    }
  }

  const allocation = input.startingEquity / symbols.length;
  const shares = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      allocation / (first.adjustedCloseBySymbol[symbol] as number),
    ]),
  );
  const equityCurve = input.observations.map((observation) => ({
    date: observation.date,
    equity: symbols.reduce(
      (total, symbol) =>
        total +
        (shares[symbol] as number) *
          (observation.adjustedCloseBySymbol[symbol] as number),
      0,
    ),
  }));
  const finalEquity = equityCurve.at(-1)?.equity as number;

  return {
    symbols,
    equityCurve,
    returnRate: finalEquity / input.startingEquity - 1,
    maximumDrawdown: computeMaximumDrawdown(equityCurve),
    turnover: 1,
    methodology: "equal_weight_frozen_eligible_universe_v1",
  };
}
