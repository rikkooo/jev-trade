import { describe, expect, it } from "vitest";

import {
  FIXTURE_SCORECARD,
  getBlindStockPageBySymbol,
  getForecastById,
  getStockBySymbol,
  getUniverse,
} from "./fixtures";

describe("fixture public projections", () => {
  it("keeps every symbol explicitly synthetic and exposes all public states", () => {
    const universe = getUniverse();

    expect(universe.length).toBeGreaterThanOrEqual(6);
    expect(new Set(universe.map((stock) => stock.symbol)).size).toBe(
      universe.length,
    );
    expect(
      universe.every((stock) => stock.dataKind === "synthetic_fixture"),
    ).toBe(true);
    expect(new Set(universe.map((stock) => stock.displayState))).toEqual(
      new Set([
        "current",
        "resolved",
        "stale",
        "incomplete",
        "failed",
        "void",
        "corrected",
      ]),
    );
  });

  it("resolves stock symbols case-insensitively without inventing records", () => {
    expect(getStockBySymbol("acme")?.symbol).toBe("ACME");
    expect(getStockBySymbol("UNKNOWN")).toBeNull();
  });

  it("keeps eligible calls blind in every universe summary", () => {
    const eligible = getUniverse().filter((stock) => stock.blind);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]).toMatchObject({
      symbol: "ACME",
      action: "HIDDEN",
      marketRiskBand: null,
    });
    const serialized = JSON.stringify(eligible);
    expect(serialized).not.toContain('"action":"UP"');
    expect(serialized).not.toContain('"marketRiskBand":"MEDIUM"');
  });

  it("preserves immutable forecast metadata and separate risk concepts", () => {
    const forecast = getForecastById("01K5D3JEVACME5SPRINT0001");

    expect(forecast).not.toBeNull();
    expect(forecast?.cutoffAt).toBe("2026-09-18T20:15:00.000Z");
    expect(forecast?.latestMarketSession).toBe("2026-09-18");
    expect(forecast?.modelVersion).toBe("typesafe/jev-1.13-20260917");
    expect(forecast?.policyVersion).toBe("paper-policy-v1");
    expect(forecast?.judgment.probabilities).toEqual({
      up: 0.62,
      flat: 0.23,
      down: 0.15,
    });
    expect(forecast?.marketRisk).toMatchObject({ index: 41, band: "MEDIUM" });
    expect(forecast?.positionRisk.kind).toBe("not_applicable");
    expect(forecast?.decisionStateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(
      getUniverse().every((stock) => {
        const full = getForecastById(stock.forecastId);
        return /^sha256:[0-9a-f]{64}$/.test(full?.decisionStateHash ?? "");
      }),
    ).toBe(true);
  });

  it("builds a complete blind stock projection without Jev or policy output", () => {
    const page = getBlindStockPageBySymbol("ACME");
    expect(page).not.toBeNull();
    expect(page?.pickEligible).toBe(true);
    expect(page?.reveal).toEqual({
      forecastId: "01K5D3JEVACME5SPRINT0001",
      symbol: "ACME",
    });

    const serialized = JSON.stringify(page);
    for (const forbidden of [
      '"judgment"',
      '"action"',
      '"marketRisk"',
      '"positionRisk"',
      '"gates"',
      '"timeline"',
      '"outcome"',
      '"probabilities"',
      "paper-policy-v1 produced",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain('"up":0.62');
  });

  it("starts the prospective scorecard at zero", () => {
    expect(FIXTURE_SCORECARD.prospectiveSampleSize).toBe(0);
    expect(FIXTURE_SCORECARD.metrics.brierScore).toBeNull();
    expect(FIXTURE_SCORECARD.metrics.hitRate).toBeNull();
    expect(FIXTURE_SCORECARD.cohort).toBe("fixture_demo_only");
  });
});
