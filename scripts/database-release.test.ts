import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  loadMigrationManifest,
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
});
