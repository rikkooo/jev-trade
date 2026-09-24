import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const ROLE_URLS = {
  OPERATOR_DATABASE_URL: "postgres://operator-login@db.invalid/jev",
  WORKER_DATABASE_URL: "postgres://worker-login@db.invalid/jev",
  PUBLIC_DATABASE_URL: "postgres://public-login@db.invalid/jev",
} as const;

describe("parseServerEnv", () => {
  it("starts safely in fixture mode without credentials", () => {
    expect(parseServerEnv({})).toMatchObject({
      APP_MODE: "fixture",
      PUBLIC_MARKET_DATA: false,
      DURABLE_WRITES: false,
    });
  });

  it("treats blank optional values from the example file as absent", () => {
    expect(
      parseServerEnv({
        DATABASE_URL: "",
        OPENROUTER_API_KEY: "",
        AI_GATEWAY_API_KEY: "",
        CRON_SECRET: "",
      }),
    ).toMatchObject({ APP_MODE: "fixture" });
  });

  it("names missing durable-write configuration without values", () => {
    expect(() =>
      parseServerEnv({ APP_MODE: "live", DURABLE_WRITES: "true" }),
    ).toThrow(
      "OPERATOR_DATABASE_URL: is required when DURABLE_WRITES=true, WORKER_DATABASE_URL: is required when DURABLE_WRITES=true, PUBLIC_DATABASE_URL: is required when DURABLE_WRITES=true",
    );
  });

  it("does not permit durable writes in fixture mode", () => {
    expect(() =>
      parseServerEnv({
        DURABLE_WRITES: "true",
        ...ROLE_URLS,
      }),
    ).toThrow("DURABLE_WRITES: requires APP_MODE=live");
  });

  it("rejects public market data outside live mode", () => {
    expect(() =>
      parseServerEnv({
        PUBLIC_MARKET_DATA: "true",
        MARKET_DATA_API_KEY: "configured",
      }),
    ).toThrow("PUBLIC_MARKET_DATA: requires APP_MODE=live");
  });

  it("requires a rights record and disclosure version for public data", () => {
    const base = {
      APP_MODE: "live",
      PUBLIC_MARKET_DATA: "true",
      DURABLE_WRITES: "true",
      ...ROLE_URLS,
      MARKET_DATA_API_KEY: "configured",
    };

    expect(() => parseServerEnv(base)).toThrow(
      "DATA_RIGHTS_RECORD_ID: is required when PUBLIC_MARKET_DATA=true",
    );
    expect(() =>
      parseServerEnv({ ...base, DATA_RIGHTS_RECORD_ID: "rights-2026-09" }),
    ).toThrow(
      "PUBLIC_DISCLOSURE_VERSION: is required when PUBLIC_MARKET_DATA=true",
    );
  });

  it("requires durable storage before enabling public market data", () => {
    expect(() =>
      parseServerEnv({
        APP_MODE: "live",
        PUBLIC_MARKET_DATA: "true",
        MARKET_DATA_API_KEY: "configured",
        DATA_RIGHTS_RECORD_ID: "rights-2026-09",
        PUBLIC_DISCLOSURE_VERSION: "disclosure-v1",
      }),
    ).toThrow("PUBLIC_MARKET_DATA: requires DURABLE_WRITES=true");
  });
});
