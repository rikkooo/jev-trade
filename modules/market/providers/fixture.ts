import type {
  MarketDataProvider,
  MarketDataRequest,
  ProviderMarketData,
} from "../contracts";

export class FixtureMarketDataProvider implements MarketDataProvider {
  readonly id = "fixture";

  constructor(
    private readonly fixtures: ReadonlyMap<string, ProviderMarketData>,
  ) {}

  async fetchMarketData(
    request: MarketDataRequest,
  ): Promise<ProviderMarketData> {
    if (request.sessions < 300) {
      throw new Error("Market adapters must request at least 300 sessions");
    }

    const fixture = this.fixtures.get(request.symbol.toUpperCase());
    if (!fixture) throw new Error(`No fixture for symbol ${request.symbol}`);
    if (fixture.benchmark.symbol !== request.benchmarkSymbol.toUpperCase()) {
      throw new Error("Fixture benchmark does not match the request");
    }

    return structuredClone(fixture);
  }
}
