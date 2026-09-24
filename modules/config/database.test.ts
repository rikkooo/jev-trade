import { describe, expect, it } from "vitest";

import {
  DatabaseRoleConfigurationError,
  operatorDatabaseUrl,
  publicDatabaseUrl,
  RUNTIME_DATABASE_ROLE_KEYS,
  workerDatabaseUrl,
} from "./database";
import * as databaseModule from "./database";
import { parseServerEnv } from "./env";

const ROLE_URLS = {
  OPERATOR_DATABASE_URL: "postgres://operator-login@db.invalid/jev",
  WORKER_DATABASE_URL: "postgres://worker-login@db.invalid/jev",
  PUBLIC_DATABASE_URL: "postgres://public-login@db.invalid/jev",
} as const;

describe("role-specific database configuration", () => {
  it("binds each runtime role to exactly its own server-side setting", () => {
    const environment = {
      APP_MODE: "live",
      DURABLE_WRITES: "true",
      ...ROLE_URLS,
    };
    expect(operatorDatabaseUrl(environment)).toBe(
      ROLE_URLS.OPERATOR_DATABASE_URL,
    );
    expect(workerDatabaseUrl(environment)).toBe(ROLE_URLS.WORKER_DATABASE_URL);
    expect(publicDatabaseUrl(environment)).toBe(ROLE_URLS.PUBLIC_DATABASE_URL);
    expect(Object.keys(RUNTIME_DATABASE_ROLE_KEYS)).toEqual([
      "operator",
      "worker",
      "public",
    ]);
  });

  it("fails closed when the role's credential is absent, even in fixture mode", () => {
    expect(() => workerDatabaseUrl({})).toThrow(DatabaseRoleConfigurationError);
    expect(() =>
      operatorDatabaseUrl({
        WORKER_DATABASE_URL: ROLE_URLS.WORKER_DATABASE_URL,
      }),
    ).toThrow(
      "OPERATOR_DATABASE_URL is required for the operator database role",
    );
  });

  it("never falls back to the retired single connection or the migration owner", () => {
    const legacyOnly = { DATABASE_URL: "postgres://legacy@db.invalid/jev" };
    expect(() => operatorDatabaseUrl(legacyOnly)).toThrow(
      DatabaseRoleConfigurationError,
    );
    const migrationOnly = {
      DATABASE_MIGRATION_URL: "postgres://owner@db.invalid/jev",
    };
    expect(() => workerDatabaseUrl(migrationOnly)).toThrow(
      DatabaseRoleConfigurationError,
    );
    expect(() =>
      parseServerEnv({
        APP_MODE: "live",
        DURABLE_WRITES: "true",
        ...ROLE_URLS,
        DATABASE_URL: "postgres://legacy@db.invalid/jev",
      }),
    ).toThrow("DATABASE_URL: is retired");
  });

  it("rejects shared role credentials and a runtime role that is the migration owner", () => {
    expect(() =>
      workerDatabaseUrl({
        ...ROLE_URLS,
        WORKER_DATABASE_URL: ROLE_URLS.OPERATOR_DATABASE_URL,
      }),
    ).toThrow("each runtime database role needs its own credential");
    expect(() =>
      operatorDatabaseUrl({
        ...ROLE_URLS,
        DATABASE_MIGRATION_URL: ROLE_URLS.OPERATOR_DATABASE_URL,
      }),
    ).toThrow("the migration owner credential cannot be a runtime role");
  });

  it("exposes no resolver a request could steer toward another role", () => {
    const exported = Object.keys(databaseModule).sort();
    expect(exported).toEqual([
      "DatabaseRoleConfigurationError",
      "RUNTIME_DATABASE_ROLE_KEYS",
      "operatorDatabaseUrl",
      "publicDatabaseUrl",
      "workerDatabaseUrl",
    ]);
    // Only the environment is read; a role-like value inside it is ignored.
    expect(workerDatabaseUrl({ ...ROLE_URLS, ROLE: "operator" })).toBe(
      ROLE_URLS.WORKER_DATABASE_URL,
    );
  });

  it("keeps error messages free of credential values", () => {
    try {
      operatorDatabaseUrl({
        ...ROLE_URLS,
        DATABASE_MIGRATION_URL: ROLE_URLS.OPERATOR_DATABASE_URL,
      });
    } catch (error) {
      expect((error as Error).message).not.toContain("operator-login");
    }
  });
});
