import { describe, expect, it } from "vitest";
import {
  buildMarketFixture,
  cutoffOf,
} from "@/tests/fixtures/market/build-fixture";
import { FixtureMarketDataProvider } from "./fixture";

describe("FixtureMarketDataProvider", () => {
  it("requires the adapter request to include at least 300 sessions", async () => {
    const fixture = buildMarketFixture();
    const provider = new FixtureMarketDataProvider(
      new Map([[fixture.instrument.symbol, fixture]]),
    );

    await expect(
      provider.fetchMarketData({
        symbol: "ACME",
        benchmarkSymbol: "BENCH",
        cutoffSession: cutoffOf(fixture),
        sessions: 299,
      }),
    ).rejects.toThrow("at least 300 sessions");
  });

  it("returns an isolated clone so a caller cannot mutate fixture history", async () => {
    const fixture = buildMarketFixture();
    const provider = new FixtureMarketDataProvider(
      new Map([[fixture.instrument.symbol, fixture]]),
    );
    const request = {
      symbol: "ACME",
      benchmarkSymbol: "BENCH",
      cutoffSession: cutoffOf(fixture),
      sessions: 300,
    };

    const first = await provider.fetchMarketData(request);
    first.bars[0]!.adjusted.close = 1;
    const second = await provider.fetchMarketData(request);

    expect(second.bars[0]!.adjusted.close).not.toBe(1);
  });
});
