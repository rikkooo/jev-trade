import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  classifyMarketRisk,
  computeMarketRisk,
  type MarketRiskInputs,
} from "./market-risk";

const safe: MarketRiskInputs = {
  volatilityPercentile: 0,
  drawdown60: 0,
  normalizedAtr14: 0.01,
  gapRiskPercentile: 0,
  sessionsToKnownEvent: null,
};

describe("computeMarketRisk", () => {
  it("preserves every declared component weight", () => {
    expect(
      computeMarketRisk({ ...safe, volatilityPercentile: 1 }),
    ).toMatchObject({
      index: 35,
      components: { volatility: 35 },
    });
    expect(computeMarketRisk({ ...safe, drawdown60: -0.2 })).toMatchObject({
      index: 20,
      components: { drawdown: 20 },
    });
    expect(computeMarketRisk({ ...safe, normalizedAtr14: 0.06 })).toMatchObject(
      {
        index: 20,
        components: { normalizedAtr: 20 },
      },
    );
    expect(computeMarketRisk({ ...safe, gapRiskPercentile: 1 })).toMatchObject({
      index: 10,
      components: { gap: 10 },
    });
    expect(
      computeMarketRisk({ ...safe, sessionsToKnownEvent: 2 }),
    ).toMatchObject({
      index: 15,
      components: { eventProximity: 15 },
    });
    expect(
      computeMarketRisk({ ...safe, sessionsToKnownEvent: 5 }),
    ).toMatchObject({
      index: 8,
      components: { eventProximity: 8 },
    });
    expect(computeMarketRisk({ ...safe, sessionsToKnownEvent: 6 }).index).toBe(
      0,
    );
  });

  it.each([
    [34, "LOW"],
    [35, "MEDIUM"],
    [64, "MEDIUM"],
    [65, "HIGH"],
  ] as const)("classifies exact boundary %i as %s", (index, expected) => {
    expect(classifyMarketRisk(index)).toBe(expected);
  });

  it("rounds halves away from zero and reaches the bounded maximum", () => {
    expect(
      computeMarketRisk({ ...safe, volatilityPercentile: 0.1 }).index,
    ).toBe(4);
    expect(
      computeMarketRisk({
        volatilityPercentile: 1,
        drawdown60: -0.2,
        normalizedAtr14: 0.06,
        gapRiskPercentile: 1,
        sessionsToKnownEvent: 0,
      }).index,
    ).toBe(100);
  });

  it.each([
    ["volatilityPercentile", Number.NaN],
    ["drawdown60", Number.POSITIVE_INFINITY],
    ["normalizedAtr14", Number.NEGATIVE_INFINITY],
    ["gapRiskPercentile", Number.NaN],
  ] as const)("fails closed for non-finite %s", (key, value) => {
    expect(() => computeMarketRisk({ ...safe, [key]: value })).toThrow(
      "DATA_INCOMPLETE",
    );
  });

  it("fails closed when a finite input is outside its declared domain", () => {
    expect(() =>
      computeMarketRisk({ ...safe, volatilityPercentile: 1.01 }),
    ).toThrow("DATA_INCOMPLETE");
    expect(() => computeMarketRisk({ ...safe, drawdown60: 0.01 })).toThrow(
      "DATA_INCOMPLETE",
    );
  });

  it("is finite and bounded for all finite inputs", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 0, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (
          volatilityPercentile,
          drawdown60,
          normalizedAtr14,
          gapRiskPercentile,
        ) => {
          const result = computeMarketRisk({
            volatilityPercentile,
            drawdown60,
            normalizedAtr14,
            gapRiskPercentile,
            sessionsToKnownEvent: null,
          });
          expect(Number.isFinite(result.index)).toBe(true);
          expect(result.index).toBeGreaterThanOrEqual(0);
          expect(result.index).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });
});
