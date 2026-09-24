# Neon and Postgres runbook

Neon Postgres is authoritative only when durable mode is enabled. Vercel cache,
function memory, browser storage, and `/tmp` are never ledger storage.

## Provisioning and separation

Provision Neon through the Vercel Marketplace or the Neon console in the same
region as the Vercel functions (`iad1` / AWS `us-east-1` initially). The CLI
entry point is:

```bash
vercel integration add neon
```

Before accepting provider prompts, confirm the selected Vercel team, project,
Neon project, region, environments, and billing owner. Enable an isolated Neon
branch per Preview deployment. Preview must never use the Production branch or
credentials.

Use:

- a pooled connection for runtime/Cron work;
- a direct connection for explicit migrations and controlled logical backups;
- separate Production and Preview logins;
- a recovery branch for every restore rehearsal.

Do not enable `DURABLE_WRITES=true` until migrations, runtime roles, immutable
table triggers, stored procedures, and role tests are implemented and verified.
The current `db/init/001_roles.sql` creates NOLOGIN capability roles only; it is
not by itself a complete production authorization setup.

## Required roles

| Role | Allowed | Forbidden |
|---|---|---|
| Migration owner | Schema ownership and explicit release migrations | Runtime use |
| Public reader | `SELECT` on approved public views | Base-table writes, licensed/raw fields |
| Public ingest | `EXECUTE` on bounded pick/analytics procedures | Direct table access, forecast publication |
| Worker | `EXECUTE` on versioned snapshot, judgment, forecast, resolution, and paper-event procedures | Schema changes, direct immutable-row updates/deletes |
| Operator | Narrow activation, correction, replay, and gate procedures | Ownership, arbitrary table mutation |
| Backup | Read needed schemas for logical export | Application writes or schema changes |

Domain-event tables must reject `UPDATE` and `DELETE` through both privileges and
triggers. A correction appends a record referencing the superseded record.

## Migration release

Migrations are explicit; never run them in `next build` or application startup.
Use additive, idempotent migrations and a database lock so concurrent releases
cannot migrate twice.

`pnpm db:migrate` is the only application-owned schema entry point. It requires
the direct migration-owner credential in `DATABASE_MIGRATION_URL`, opens one
transaction, and acquires the transaction-scoped advisory lock
`jev-trade/schema-migrations/v1` before inspecting or changing the schema. It
then applies this reviewed manifest in order:

| Version | Reviewed source |
|---|---|
| `0000_roles` | `db/init/001_roles.sql` |
| `0001_immutable_ledger` | `db/migrations/0001_immutable_ledger.up.sql` |
| `0002_evidence_lab_registry` | `db/migrations/0002_evidence_lab_registry.up.sql` |

The runner hashes each complete source file with SHA-256. A successful
application records the version, repository path, checksum, time, and migration
session user in `public.schema_migrations` in the same transaction as the schema
change. A retry skips a matching record. A changed path or checksum for an
already-recorded version aborts the whole transaction. The application roles
have no access to the registry.

Do not edit an applied SQL file. Add a new ordered migration and update the
reviewed manifest. Production does not use the down file; it exists only for
disposable schema development and must never be substituted for the
expand/migrate/contract process.

1. Create or select an isolated Neon branch from the current Production point.
2. Record the current Production schema version and application SHA.
3. Apply the migration to the branch using the migration owner.
4. Run database verification, integration tests, replay/invariant tests, and the
   prior application version against the expanded schema.
5. Review SQL for grants, immutable-table triggers, long locks, table rewrites,
   data loss, and rollback compatibility.
6. Apply the exact reviewed migration once to Production before application
   promotion.
7. Deploy application code compatible with both the old and expanded schema.
8. Defer destructive contract migrations until the compatibility window closes.

When the migration URL is stored in Vercel, prefer a command that injects it
without writing a `.env` file:

```bash
vercel env run -e production -- pnpm db:migrate
vercel env run -e production -- pnpm db:verify
```

Check `vercel env run --help` and confirm environment/project selection before
execution. If the CLI cannot isolate the migration credential from the runtime,
run the migration from an approved operator environment and remove the
migration URL from Vercel after use.

The currently declared commands are:

```bash
pnpm db:migrate
pnpm db:verify
```

Both commands fail before connecting when `DATABASE_MIGRATION_URL` is absent and
redact URL-shaped credentials from errors. Neither command reports the
connection string. Successful migration output contains only applied/skipped
version IDs. `pnpm db:verify` runs in a read-only transaction and reports only
the applied versions and named check groups.

Run both commands against the isolated release branch before promotion:

```bash
pnpm db:migrate
pnpm db:migrate # required no-op retry; every version must be skipped
pnpm db:verify
```

The verifier checks the registry against the checked-in file hashes, the
`pgcrypto` extension, every critical table and projection, immutable and
lifecycle triggers, application-role attributes, schema and relation
privileges, the exact stored-procedure execute matrix, `SECURITY DEFINER`
search paths, critical indexes, and validated constraints. It does not insert,
update, or delete domain data.

CI repeats the release on disposable PostgreSQL 16.10. It starts two migration
runners concurrently to exercise the advisory lock, proves the next retry is a
no-op, runs this verifier, executes `tests/db/ledger-foundation.sql`, verifies
again, runs the Phase Two denial suite `tests/db/evidence-lab-foundation.sql`,
drives the Evidence Lab fixture through per-role logins, verifies again, and
rehearses the upgrade from a populated v0.1 database with
`tests/db/rehearse-evidence-lab-upgrade.sh`. It then corrupts a disposable
registry checksum and requires the next migration attempt to fail without
exposing a URL. A green CI database job is release evidence for the checked-in
revision; it is not evidence that a Neon Production migration occurred.

`pnpm db:migrate -- --through <version>` stops after a reviewed manifest version.
It exists to rehearse upgrades from a released shape on disposable databases.
Both the runner and the verifier refuse a database that records a migration
absent from the reviewed manifest, because once Phase Two evidence exists
recovery is forward-only. See the
[Evidence Lab database foundation](evidence-lab-database.md) for the Phase Two
privilege matrix, gates, and rollback policy.

### Role verification

Run destructive authorization tests only on a disposable branch. Verification
must prove:

- public reader cannot write;
- public ingest can call only bounded public procedures;
- worker cannot alter schema or update/delete immutable events;
- operator can append allowed activation/correction events but cannot own schema;
- migration owner is unavailable to deployed web/Cron functions;
- duplicate idempotency keys return the existing result;
- projection rebuild equals incremental projections.

Safe metadata inspection may use `psql` queries such as:

```sql
SELECT current_user, current_database();
SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 10;
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee LIKE 'jev_%'
ORDER BY grantee, table_schema, table_name, privilege_type;
```

`schema_migrations` is the required production migration registry; if the table
does not exist yet, the database is not ready for durable mode.

## Encrypted logical backup

Enable Neon PITR/snapshots for short-horizon recovery and keep an independent,
encrypted logical export. The initial retention target is seven daily and four
weekly exports. The decryption private key stays off-host.

The following pattern keeps the database URL out of process arguments and writes
only an encrypted archive. Use a public `age` recipient file reviewed for this
project:

```bash
set +x
umask 077
backup_dir='<APPROVED-ENCRYPTED-BACKUP-STAGING-DIR>'
recipient_file='<PATH-TO-AGE-RECIPIENTS-FILE>'
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"

read -r -s -p 'Neon direct backup URL: ' DATABASE_BACKUP_URL
printf '\n' >&2
export PGDATABASE="$DATABASE_BACKUP_URL"
unset DATABASE_BACKUP_URL

pg_dump --format=custom --no-owner --no-acl \
  | age -R "$recipient_file" \
  >"$backup_dir/jev-trade-$stamp.dump.age"

unset PGDATABASE
sha256sum "$backup_dir/jev-trade-$stamp.dump.age" \
  >"$backup_dir/jev-trade-$stamp.dump.age.sha256"
```

Upload the encrypted archive and checksum to the approved off-host destination.
Do not upload an unencrypted intermediate. Verify object size, checksum, object
retention, and access policy. Deletion for retention should be automated by a
reviewed lifecycle rule; never improvise `rm -rf` or bucket-wide deletion in this
runbook.

The backup receipt records archive ID, UTC timestamp, encrypted size, checksum,
source branch identifier, schema version, and destination object ID. It does not
record a connection string or data sample.

## Restore rehearsal

Never restore over Production. Create a new isolated Neon recovery branch or
empty recovery database with no public routes, Cron schedules, provider keys, or
outbound paid-call capability.

1. Download the encrypted archive and checksum to an owner-readable directory.
2. Verify the encrypted checksum before decryption.
3. Decrypt as a stream and restore into the empty recovery target.
4. Run schema, role, ledger-chain, projection-rebuild, and forecast verification.
5. Record recovery point and recovery time objectives achieved.
6. Destroy the temporary decrypted stream/file immediately if one was created;
   retain the encrypted backup per policy.
7. Delete the recovery branch only after the receipt and independent review are
   complete.

Streamed restore pattern:

```bash
set +x
umask 077
archive='<PATH-TO-ENCRYPTED-DUMP>'
identity_file='<PATH-TO-OFF-HOST-AGE-IDENTITY-COPY>'
sha256sum --check "$archive.sha256"

read -r -s -p 'Empty recovery database URL: ' RESTORE_DATABASE_URL
printf '\n' >&2
export PGDATABASE="$RESTORE_DATABASE_URL"
unset RESTORE_DATABASE_URL

age --decrypt -i "$identity_file" "$archive" \
  | pg_restore --exit-on-error --single-transaction --no-owner --no-acl

unset PGDATABASE
```

Use only a confirmed empty recovery database. If restore reports pre-existing
objects, stop; do not add `--clean` against an uncertain target.

After restore:

```bash
# Point DATABASE_MIGRATION_URL at the isolated recovery branch through a hidden
# operator environment, then run:
pnpm db:verify
pnpm verify:forecast -- --id <KNOWN-FIXTURE-OR-PUBLIC-FORECAST-ULID>
```

Verification must reconstruct at least three forecasts, one correction chain,
one corporate-action case, publication roots, and scorecard projections. It must
also prove no role unexpectedly gained mutation or schema privileges.

## Production recovery and cutover

For a corrupt/unavailable Production branch:

1. Stop new writes/Cron publication and serve the last validated fixture or
   read-only failure state.
2. Preserve the failed branch and provider incident evidence.
3. Recover to a Neon branch using PITR or the latest verified encrypted export.
4. Determine the exact last valid ledger root and list the recovery gap. Never
   silently recreate judgments or forecasts.
5. Verify schema, role boundaries, hash chain, projections, and representative
   forecasts.
6. Point a restricted Preview deployment at the recovery branch and run smoke
   tests with outbound paid calls disabled.
7. Rotate database credentials and perform a reviewed cutover.
8. Resume reconciliation before new EOD publication. Append incident/correction
   events for any gap.

## Database receipt

- [ ] Source and target branch IDs, regions, and schema versions recorded.
- [ ] Production/Preview isolation checked.
- [ ] Migration lock, idempotence, expand/contract review, and N-1 app check
      recorded.
- [ ] Role matrix and immutable-trigger tests passed on a disposable branch.
- [ ] Encrypted archive checksum and off-host object ID recorded.
- [ ] Restore used a new isolated target and no Production overwrite.
- [ ] Ledger chain, projections, and representative forecast reconstruction
      passed.
- [ ] Recovery gap and any appended correction events recorded.
- [ ] No URL, password, payload, or decrypted data entered the receipt.
- [ ] Independent reviewer recorded.
