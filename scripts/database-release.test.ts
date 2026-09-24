import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  assertNoUnknownMigrations,
  loadMigrationManifest,
  parseMigrationArguments,
  prepareMigrationSql,
  redactDatabaseError,
  requireMigrationUrl,
} from "./migrate";

describe("database release migrations", () => {
  it("pins the reviewed role and ledger SQL by version and checksum", async () => {
    const manifest = await loadMigrationManifest();

    expect(
      manifest.map(({ version, fileName }) => ({ version, fileName })),
    ).toEqual([
      { version: "0000_roles", fileName: "db/init/001_roles.sql" },
      {
        version: "0001_immutable_ledger",
        fileName: "db/migrations/0001_immutable_ledger.up.sql",
      },
      {
        version: "0002_evidence_lab_registry",
        fileName: "db/migrations/0002_evidence_lab_registry.up.sql",
      },
    ]);

    for (const migration of manifest) {
      const source = await readFile(migration.absolutePath, "utf8");
      expect(migration.checksum).toBe(
        createHash("sha256").update(source).digest("hex"),
      );
    }
  });

  it("removes psql directives and outer transaction wrappers only", () => {
    const source = String.raw`\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  PERFORM 1;
END
$$;
COMMIT;
`;

    expect(prepareMigrationSql(source)).toBe(`DO $$
BEGIN
  PERFORM 1;
END
$$;`);
  });

  it("fails closed without the migration-only credential", () => {
    expect(() => requireMigrationUrl({})).toThrow(
      "DATABASE_MIGRATION_URL is required",
    );
  });

  it("redacts both the exact credential and URL-shaped credentials", () => {
    const credential = "postgres://owner:secret@database.example/jev";
    const message = `${credential} failed via postgres://other:hidden@backup/jev`;

    expect(redactDatabaseError(new Error(message), credential)).toBe(
      "[REDACTED_DATABASE_URL] failed via [REDACTED_DATABASE_URL]",
    );
  });

  it("rehearses an upgrade only through a reviewed manifest version", async () => {
    const manifest = await loadMigrationManifest();
    expect(parseMigrationArguments([], manifest)).toEqual({ through: null });
    expect(
      parseMigrationArguments(
        ["--", "--through", "0001_immutable_ledger"],
        manifest,
      ),
    ).toEqual({ through: "0001_immutable_ledger" });
    expect(() =>
      parseMigrationArguments(["--through", "0009_unknown"], manifest),
    ).toThrow("not a reviewed manifest version");
    expect(() => parseMigrationArguments(["--force"], manifest)).toThrow(
      "usage: db:migrate",
    );
  });

  it("refuses a database already migrated past the reviewed manifest", async () => {
    const manifest = await loadMigrationManifest();
    const v01Manifest = manifest.slice(0, 2);
    expect(() =>
      assertNoUnknownMigrations(
        ["0000_roles", "0001_immutable_ledger", "0002_evidence_lab_registry"],
        v01Manifest,
      ),
    ).toThrow("recovery is forward-only");
    expect(() =>
      assertNoUnknownMigrations(["0000_roles"], manifest),
    ).not.toThrow();
  });
});
