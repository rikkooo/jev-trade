import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("starts safely in fixture mode without credentials", () => {
    expect(parseServerEnv({})).toMatchObject({
      APP_MODE: "fixture",
      PUBLIC_MARKET_DATA: false,
      DURABLE_WRITES: false,
    });
  });

  it("names missing durable-write configuration without values", () => {
    expect(() => parseServerEnv({ DURABLE_WRITES: "true" })).toThrow(
      "DATABASE_URL: is required when DURABLE_WRITES=true",
    );
  });

  it("rejects public market data outside live mode", () => {
    expect(() =>
      parseServerEnv({
        PUBLIC_MARKET_DATA: "true",
        MARKET_DATA_API_KEY: "configured",
      }),
    ).toThrow("PUBLIC_MARKET_DATA: requires APP_MODE=live");
  });
});
