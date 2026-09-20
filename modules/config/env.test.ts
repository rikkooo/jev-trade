import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";
import {
  operatorDatabaseUrl,
  publicDatabaseUrl,
  workerDatabaseUrl,
} from "./database";

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
    expect(() => parseServerEnv({ DURABLE_WRITES: "true" })).toThrow(
      "DATABASE_URL: is required when DURABLE_WRITES=true",
    );
  });

  it("does not permit durable writes in fixture mode", () => {
    expect(() =>
      parseServerEnv({
        DURABLE_WRITES: "true",
        DATABASE_URL: "postgres://configured",
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
      DATABASE_URL: "postgres://configured",
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

  it("keeps fixture mode credential-free while requiring the matching Phase Two role URL on demand", () => {
    expect(parseServerEnv({})).toMatchObject({ APP_MODE: "fixture" });
    expect(() =>
      workerDatabaseUrl({
        APP_MODE: "live",
        DURABLE_WRITES: "true",
        DATABASE_URL: "postgres://legacy-runtime",
      }),
    ).toThrow("WORKER_DATABASE_URL is required for the worker database role");
  });

  it("uses only a static server role and never falls back to a request-selectable credential", () => {
    const environment = {
      APP_MODE: "live",
      DURABLE_WRITES: "true",
      DATABASE_URL: "postgres://legacy-runtime",
      OPERATOR_DATABASE_URL: "postgres://operator",
      WORKER_DATABASE_URL: "postgres://worker",
      PUBLIC_DATABASE_URL: "postgres://public",
    } as const;

    expect(operatorDatabaseUrl(environment)).toBe("postgres://operator");
    expect(workerDatabaseUrl(environment)).toBe("postgres://worker");
    expect(publicDatabaseUrl(environment)).toBe("postgres://public");
  });
});
