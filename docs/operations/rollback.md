# Application rollback and schema compatibility

Keep at least one previously validated immutable deployment available. An
application rollback does not change Postgres and must never be used to conceal
or rewrite already-published records.

## Release compatibility contract

Every database change follows expand, migrate, contract:

1. **Expand:** add nullable columns, new tables, new views/procedures, and dual
   read/write support without removing old structures.
2. **Migrate/backfill:** append or backfill disposable projections through a
   bounded, resumable job. Never mutate immutable domain evidence.
3. **Deploy:** promote code that works with both the old and expanded schema.
4. **Observe:** keep the previous application version runnable for at least the
   declared rollback window and through one scheduled-cycle rehearsal.
5. **Contract:** remove old structures only in a later release after the rollback
   window closes and a fresh backup/restore receipt exists.

Before promotion, record this matrix:

| Combination | Required result |
|---|---|
| New app + expanded schema | Pass |
| Prior app + expanded schema | Pass |
| New app + previous schema | Either pass or fail closed before promotion; document |
| Fixture fallback + any current schema | Pass without database authority |

Production migrations do not use automatic down migrations. If a schema change
is unsafe for the prior app, forward-fix the app/schema or recover to a new
database branch through the database runbook.

## Rollback triggers

Rollback or promote the safe fixture deployment when any of these occurs:

- readiness/health failure after promotion;
- secrets or licensed fields exposed to a public response;
- wrong environment/branch/provider connected;
- duplicate publication, mutable ledger behavior, or future-data leakage;
- wrong model/question/policy version used for a scored record;
- elevated server error rate or broken critical journey;
- schema mismatch the current application cannot tolerate;
- public market data displayed without an active rights gate.

Preserve evidence first when doing so does not prolong an exposure. Credential or
rights exposure requires immediate containment before investigation.

## Vercel fixture rollback

1. Identify the last validated fixture deployment from a completed receipt.
2. Confirm its commit, mode, capability flags, and immutable URL.
3. Inspect `vercel rollback --help`; then use Vercel Instant Rollback or the
   dashboard to assign Production to that exact deployment.
4. Verify the immutable URL and canonical domain.
5. Inspect the project Cron Jobs page. Vercel rollback does not change active Cron
   schedules, and an invocation already running is not stopped.
6. Confirm Cron routes no-op/fail closed with durable writes disabled.

CLI shape after confirming the installed version:

```bash
vercel rollback --help
vercel rollback '<PREVIOUS-VALIDATED-DEPLOYMENT-URL-OR-ID>'
```

Never choose a rollback target only because it is the immediately previous
deployment. It must have a completed receipt and schema compatibility record.

Verify:

```bash
rollback_url='https://<ROLLED-BACK-IMMUTABLE-DEPLOYMENT-HOST>'
curl --fail --silent --show-error "$rollback_url/health/live"
curl --fail --silent --show-error "$rollback_url/api/health" | jq .
curl --fail --silent --show-error --head "$rollback_url/" | sed -n '1,30p'
```

For an emergency safe-state rollback, expected flags are fixture/false/false.

## Durable application rollback

1. Stop new publication and entry. Let an in-flight database transaction finish
   or roll back; do not kill the database mid-commit.
2. Record current deployment, schema version, active versions, latest ledger
   root, and running Cron/job IDs.
3. Confirm the prior app passed against the current expanded schema.
4. Roll back web and Cron code together to the same commit/deployment.
5. Confirm active Vercel Cron schedules and authenticated route behavior.
6. Verify public reads, one representative forecast reconstruction, pending job
   state, duplicate idempotency behavior, and no new publication.
7. Resume deterministic stop/horizon and reconciliation work only when valid
   market data and current schema are available.
8. Append incident/correction events for affected jobs. Published forecasts keep
   their original versions and state.

If N-1 compatibility was not proven, do not point the old application at
Production. Promote the fixture fallback and prepare a forward fix or database
recovery branch.

## Schema problem after application rollback

- Do not run a destructive down migration on Production.
- If the expanded schema is intact and compatible, leave it in place.
- If a bad migration changed disposable projections, fix/rebuild projections
  from immutable events.
- If immutable evidence may be corrupt, stop writes, preserve the branch, and
  restore to a new branch using [database recovery](database.md#production-recovery-and-cutover).
- Compare the recovered last valid ledger root with external attestation. Any
  missing or mismatched records remain visible as incident/correction evidence.

## Local Docker rollback

The current Compose path builds the working tree and is intended for validation.
A production box rollback requires immutable image tags/digests. Once a registry
is configured, record both current and prior digests in every release receipt and
update the Compose image reference to the reviewed prior digest. Do not rebuild a
moving tag and call it a rollback.

After selecting a prior immutable image:

```bash
docker compose --env-file '<RUNTIME-ENV-FILE>' -f deploy/compose.yaml config --quiet
docker compose --env-file '<RUNTIME-ENV-FILE>' -f deploy/compose.yaml up -d --no-build web
docker compose --env-file '<RUNTIME-ENV-FILE>' -f deploy/compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1:3000/health/live
```

Do not remove volumes during application rollback.

## Rollback receipt

- [ ] Trigger, incident ID, current and target deployments, SHAs, and UTC times
      recorded.
- [ ] Target had a prior completed validation receipt.
- [ ] Current schema version and N-1 compatibility result recorded.
- [ ] New publication/entry stopped before rollback.
- [ ] Web and Cron code aligned; Vercel Cron schedule inspected separately.
- [ ] Health, capability flags, critical reads, and canonical domain verified.
- [ ] Ledger/root continuity and affected job IDs checked.
- [ ] No immutable record was changed or deleted.
- [ ] Forward-fix/recovery work and resume decision recorded.
- [ ] Independent reviewer recorded.

