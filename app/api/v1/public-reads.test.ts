import { describe, expect, it } from "vitest";

import { GET as getReady } from "@/app/health/ready/route";
import sitemap from "@/app/sitemap";

import { GET as getForecast } from "./forecasts/[id]/route";
import { GET as getHome } from "./home/route";
import { GET as getVersions } from "./methodology/versions/route";
import { GET as getScorecard } from "./scorecard/route";
import { GET as getSymbol } from "./symbols/[symbol]/route";
import { GET as getSymbols } from "./symbols/route";

describe("fixture public read contracts", () => {
  it("returns home, symbol-list, scorecard, methodology and readiness projections", async () => {
    const home = await getHome();
    expect(home.status).toBe(200);
    await expect(home.json()).resolves.toMatchObject({
      dataKind: "synthetic_fixture",
      forecastCount: 9,
      symbolCount: 8,
      forecastIndex: expect.arrayContaining([
        expect.objectContaining({
          id: "01K5D3JEVNOVA20ENTRY001",
          symbol: "NOVA",
          publicAuditRoute: true,
        }),
      ]),
      scorecard: { prospectiveSampleSize: 0 },
    });

    const symbols = await getSymbols(
      new Request("http://localhost/api/v1/symbols?query=mesa"),
    );
    await expect(symbols.json()).resolves.toMatchObject({
      symbols: [{ symbol: "MESA" }],
    });

    const scorecard = await getScorecard(
      new Request("http://localhost/api/v1/scorecard?mode=sprint&horizon=5"),
    );
    await expect(scorecard.json()).resolves.toMatchObject({
      filters: { mode: "SPRINT", horizon: 5 },
    });

    const versions = await getVersions();
    await expect(versions.json()).resolves.toMatchObject({
      versions: { methodology: "methodology-v1.0", policy: "paper-policy-v1" },
    });

    const ready = await getReady();
    await expect(ready.json()).resolves.toMatchObject({
      status: "ready",
      mode: "fixture",
    });

    expect(sitemap().map(({ url }) => url)).toContain(
      "http://localhost:3000/forecasts/01K5D3JEVNOVA20ENTRY001",
    );
  });

  it("keeps the blind symbol and forecast audit routes free of the hidden call", async () => {
    const symbol = await getSymbol(
      new Request("http://localhost/api/v1/symbols/acme"),
      { params: Promise.resolve({ symbol: "acme" }) },
    );
    const text = await symbol.text();
    expect(symbol.status).toBe(200);
    expect(text).not.toContain('"judgment"');
    expect(text).not.toContain('"action":"UP"');

    const forecast = await getForecast(
      new Request("http://localhost/api/v1/forecasts/blind"),
      { params: Promise.resolve({ id: "01K5D3JEVACME5SPRINT0001" }) },
    );
    expect(forecast.status).toBe(404);
  });

  it("returns stable errors for invalid filters and unknown projections", async () => {
    const invalid = await getScorecard(
      new Request("http://localhost/api/v1/scorecard?mode=short"),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "INVALID_SCORECARD_FILTER" },
    });

    const missing = await getSymbol(
      new Request("http://localhost/api/v1/symbols/nope"),
      { params: Promise.resolve({ symbol: "nope" }) },
    );
    expect(missing.status).toBe(404);
  });
});
