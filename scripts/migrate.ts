import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import postgres from "postgres";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_LOCK_KEY = "jev-trade/schema-migrations/v1";

const MIGRATION_FILES = [
  {
    version: "0000_roles",
    fileName: "db/init/001_roles.sql",
  },
  {
    version: "0001_immutable_ledger",
    fileName: "db/migrations/0001_immutable_ledger.up.sql",
  },
  {
    version: "0002_evidence_lab_registry",
    fileName: "db/migrations/0002_evidence_lab_registry.up.sql",
  },
] as const;

export interface MigrationSource {
  readonly version: string;
  readonly fileName: string;
  readonly absolutePath: string;
  readonly checksum: string;
  readonly sql: string;
}

interface AppliedMigration {
  readonly version: string;
  readonly file_name: string;
  readonly checksum: string;
}

export function requireMigrationUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const databaseUrl = environment.DATABASE_MIGRATION_URL;
  if (!databaseUrl?.trim()) {
    throw new Error(
      "DATABASE_MIGRATION_URL is required for database release commands.",
    );
  }
  return databaseUrl;
}

export function redactDatabaseError(
  error: unknown,
  databaseUrl?: string,
): string {
  const raw =
    error instanceof Error ? error.message : "database command failed";
  const withoutExactValue = databaseUrl
    ? raw.split(databaseUrl).join("[REDACTED_DATABASE_URL]")
    : raw;
  return withoutExactValue.replace(
    /(?:postgres(?:ql)?:\/\/)[^\s"']+/gi,
    "[REDACTED_DATABASE_URL]",
  );
}

export function prepareMigrationSql(source: string): string {
  const withoutPsqlDirectives = source.replace(
    /^\s*\\set\s+[^\r\n]*(?:\r?\n|$)/gim,
    "",
  );
  const lines = withoutPsqlDirectives.trim().split(/\r?\n/);

  if (lines[0]?.trim().toUpperCase() === "BEGIN;") lines.shift();
  if (lines.at(-1)?.trim().toUpperCase() === "COMMIT;") lines.pop();

  const prepared = lines.join("\n").trim();
  if (!prepared) throw new Error("migration source is empty after preparation");
  return prepared;
}

export async function loadMigrationManifest(): Promise<
  readonly MigrationSource[]
> {
  return Promise.all(
    MIGRATION_FILES.map(async ({ version, fileName }) => {
      const absolutePath = resolve(REPOSITORY_ROOT, fileName);
      const sql = await readFile(absolutePath, "utf8");
      return {
        version,
        fileName,
        absolutePath,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
  );
}

async function migrate(): Promise<void> {
  const databaseUrl = requireMigrationUrl();
  const migrations = await loadMigrationManifest();
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => undefined,
  });

  try {
    const result = await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${MIGRATION_LOCK_KEY}, 0))`;
      await transaction.unsafe(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          version text PRIMARY KEY CHECK (version <> ''),
          file_name text NOT NULL UNIQUE CHECK (file_name <> ''),
          checksum char(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
          applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          applied_by text NOT NULL DEFAULT session_user
        )
      `);

      const applied: string[] = [];
      const skipped: string[] = [];

      for (const migration of migrations) {
        const rows = await transaction<AppliedMigration[]>`
          SELECT version, file_name, checksum
          FROM public.schema_migrations
          WHERE version = ${migration.version}
          FOR UPDATE
        `;
        const existing = rows[0];

        if (existing) {
          if (
            existing.file_name !== migration.fileName ||
            existing.checksum.trim() !== migration.checksum
          ) {
            throw new Error(
              `migration ${migration.version} checksum or file identity does not match the reviewed source`,
            );
          }
          skipped.push(migration.version);
          continue;
        }

        await transaction.unsafe(prepareMigrationSql(migration.sql));
        await transaction`
          INSERT INTO public.schema_migrations (version, file_name, checksum)
          VALUES (${migration.version}, ${migration.fileName}, ${migration.checksum})
        `;
        applied.push(migration.version);
      }

      await transaction.unsafe(`
        REVOKE ALL ON TABLE public.schema_migrations
        FROM PUBLIC, jev_public_reader, jev_public_ingest, jev_worker, jev_operator
      `);

      return { applied, skipped };
    });

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        applied: result.applied,
        skipped: result.skipped,
      })}\n`,
    );
  } catch (error: unknown) {
    throw new Error(redactDatabaseError(error, databaseUrl));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  migrate().catch((error: unknown) => {
    process.stderr.write(`${redactDatabaseError(error)}\n`);
    process.exitCode = 1;
  });
}
