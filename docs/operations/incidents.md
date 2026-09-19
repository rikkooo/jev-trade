# Incident runbook

The first response protects the evidence chain and prevents a stale, unlicensed,
or unversioned output from becoming a new trade action.

## Severity and common first response

| Severity | Example | Response target |
|---|---|---|
| SEV-1 | Public secret/licensed-payload exposure, ledger corruption, unauthorized write, wrong cohort/version published | Contain immediately; page owner and independent reviewer |
| SEV-2 | Production DB unavailable, widespread stale data, provider/Jev outage near cutoff, missed attestation deadline | Acknowledge within 15 minutes during operating window |
| SEV-3 | Single-symbol/job failure, delayed noncritical page, alerting defect with healthy core | Triage same operating day |

For every incident:

1. Create an incident ID and UTC timeline. Record IDs and redacted metadata, not
   secrets or provider payloads.
2. Stop new forecast publication and paper entries when input, model, version, or
   persistence integrity is uncertain.
3. Preserve existing forecasts and ledger events. Never edit a published record
   to make the incident disappear.
4. Keep deterministic stops/horizon exits running only if durable state and the
   required current market data are valid. Jev failure alone must not disable a
   deterministic exit.
5. Show a clear stale/unavailable/failed state. Do not present old data as current
   or fabricate a judgment.
6. Capture deployment SHA, schema/version IDs, affected job/forecast/root IDs,
   provider status, safe error class, and last successful cutoff.
7. Recover through idempotent reconciliation. Duplicate invocations must return
   the existing result.
8. Append corrections/incident events and complete a reviewed receipt before
   resuming.

Common read-only checks:

```bash
origin='https://<IMMUTABLE-DEPLOYMENT-HOST>'
curl --fail --silent --show-error "$origin/health/live"
curl --silent --show-error "$origin/api/health" | jq .
vercel inspect '<DEPLOYMENT-URL-OR-ID>'
```

Never use a health endpoint to make a paid provider/Jev request.

## Market-data provider outage or invalid response

**Detection:** provider timeout/5xx/429/auth error, missing or duplicate session,
partial bar, stale last session, corporate-action inconsistency, non-finite value,
benchmark mismatch, or data beyond the cutoff.

**Containment:**

- fail the affected snapshot/job closed as provider unavailable,
  `DATA_INCOMPLETE`, or stale;
- publish no new forecast or entry for that symbol/cutoff;
- retain prior forecasts with their original cutoff and show a prominent stale
  or provider-unavailable banner;
- disable new blind picks for a stale cohort;
- do not switch a scored cohort to another provider unless a new provider/data
  contract and cohort boundary were activated prospectively;
- if rights/contract status is uncertain, set public market data off and promote
  the validated fixture deployment.

**Recovery:** verify provider status and contract, ingest the corrected completed
session, recompute through a new idempotent job, and append source correction
events. A corrected source does not rewrite the original forecast. If the
forecast cutoff passed without valid input, leave the run failed/void according
to the active policy; do not backdate it.

## Jev/OpenRouter outage or invalid response

**Detection:** timeout, network/5xx/429, authentication failure, missing answer,
unknown option, out-of-range/non-normalized probability, response schema drift,
or returned model mismatch.

**Containment:**

- make no new Jev-derived action;
- preserve the failed judgment attempt with safe status/error class;
- retry only transient failures within the active bounded retry policy and
  budget; never retry authentication or validation failures blindly;
- do not fall back to a different model, endpoint, question set, or cached answer
  for a scored publication;
- continue deterministic stop/horizon processing for existing positions when its
  data and database are valid;
- keep old forecasts visible with a judgment-failed/unavailable status.

**Recovery:** run one non-scored frozen-snapshot smoke test, verify the exact
returned model and response contract, then reconcile pending eligible jobs. If
the model changed, open the [version activation](version-activation.md) process;
do not resume the old cohort under a new build.

## Budget exhaustion or unexpected spend

**Detection:** provider/OpenRouter cap reached, daily application counter reached,
usage spike, anomalous retry volume, or missing cost metadata.

**Containment:**

- stop new paid calls at the application budget gate;
- do not automatically raise the limit or rotate to a fresh key to bypass it;
- cancel queued speculative/repeatability work before required production work;
- publish no result from a partial judgment batch;
- keep deterministic exits operating if they need no exhausted service;
- check for a leaked key, retry loop, duplicate Cron delivery, changed price, or
  expanded universe.

**Recovery:** reconcile provider usage against application operation IDs, fix the
cause, obtain owner approval for any revised cap, and activate the new budget for
a future run. Record actual unit cost and retry count. Forecasts missed during the
cap remain missed/failed; do not backdate them.

## Stale data

**Detection:** latest completed eligible market session or provider availability
timestamp violates the active freshness rule.

**Required UI/API state:**

- `STALE — HISTORICAL ONLY` or an equally explicit banner;
- original cutoff and last successful refresh visible;
- current-action emphasis suppressed;
- no new forecast, paper entry, or visitor pick for the stale cohort;
- public API freshness/status field reports stale;
- existing immutable detail and methodology links remain available.

Investigate exchange calendar, holiday/half-day handling, provider publication
delay, Cron delivery, and database freshness independently. Never move the
cutoff or substitute a partial current bar to make data look fresh.

## Missed or failed Vercel Cron

Vercel does not guarantee retry. A new deployment also does not terminate an
already-running Cron invocation.

1. Inspect Vercel Cron history, function logs, operation/job rows, and leases.
2. Confirm whether the scheduled operation ID exists and whether a transaction
   committed.
3. Release only an expired lease through the versioned recovery procedure; do
   not edit a running job row.
4. Invoke reconciliation, not a raw republish, after fixing the cause.
5. Verify duplicate delivery returns the existing publication and does not
   duplicate paper events.

Once the authenticated handlers exist, use a protected curl config so the bearer
secret does not appear in process arguments:

```bash
set +x
umask 077
curl_config="$(mktemp)"
read -r -s -p 'Cron secret: ' CRON_SECRET_VALUE
printf '\n' >&2
printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET_VALUE" >"$curl_config"
unset CRON_SECRET_VALUE
printf 'url = "https://<IMMUTABLE-PRODUCTION-HOST>/api/cron/reconcile"\n' >>"$curl_config"
printf 'fail-with-body\nsilent\nshow-error\n' >>"$curl_config"
curl --config "$curl_config"
rm -f "$curl_config"
unset curl_config
```

Do not run this in fixture mode. Do not manually call the EOD publication route
when reconciliation can inspect and claim pending work safely.

## Missed external attestation

If the publication root receipt arrives after its pre-session deadline, every
affected forecast remains `EXTERNALLY_UNVERIFIED`, receives no paper fill, and is
permanently excluded from the prospective scorecard. There is no late-admission
grace window.

1. Page the operator as the deadline approaches or is missed.
2. Stop related entry processing.
3. Preserve the original dispatch envelope, root, previous-root link, provider
   timestamps, GitHub run URL/conclusion, start artifact, terminal artifact when
   present, and any receipt. The run conclusion remains explicit evidence when
   a manual cancellation prevents the terminal job from running.
4. Identify whether the run stopped before archival, during the non-force branch
   update, or after archival and before/during attestation. Do not infer
   attestation from the root's presence on `ledger-roots`.
5. Replay the exact original dispatch envelope. Do not create a new batch key or
   root, change its deadline, or point it at a different predecessor. If the
   original archive commit completed, replay is idempotent. If it did not, the
   append succeeds only while the durable head still matches the original
   predecessor; a competing head is an integrity incident, not permission to
   force-update or re-anchor.
6. Before the deadline, the replay may complete external attestation. At or after
   the deadline, the original root may still be archived to keep the chain
   complete, but the pre-attestation gate fails loudly and starts no new external
   attestation. An attestation action that began before the deadline but finished
   after it also fails the completion check and remains late evidence. Every
   affected forecast remains permanently `EXTERNALLY_UNVERIFIED` with no paper
   fill or prospective admission.
7. Verify that `head.json`, `roots/<ROOT_HASH>.json`, the workflow attempt
   evidence, and the database root all identify the same immutable envelope.
   Resume later batches only after the missing original root is the durable head
   and the path is healthy; their predecessor links must remain unchanged.
8. Run the rolling 30-day missed-root query. More than 2% missed roots fails the
   promotion reliability gate.

Never alter a root timestamp, forecast cutoff, receipt time, or eligibility flag
to rescue a missed cohort.

## Database outage, corruption, or disk failure

**Vercel/Neon:** serve a clear unavailable or last-known immutable read state only
if its cache semantics are proven. Fail all authoritative writes closed. Do not
write to function memory or `/tmp`. Stop Cron work, preserve the failed branch,
and use [database recovery](database.md#production-recovery-and-cutover).

**Local Docker/box:**

```bash
df -h
df -i
docker system df
docker compose --env-file '<RUNTIME-ENV-FILE>' -f deploy/compose.yaml ps
```

Do not run `docker system prune`, delete logs, truncate Postgres files, or remove
volumes during triage. Stop new application writes, make a storage snapshot if
the platform supports it, and restore to new storage from the latest verified
encrypted backup. Compare the restored ledger root with the external receipt
before cutover.

If disk pressure affects only disposable build/cache data, cleanup still needs a
reviewed path list and receipt. Database WAL/data and operation logs are not
disposable cleanup targets.

## Incident closure checklist

- [ ] Incident ID, severity, UTC timeline, owner, and affected environment
      recorded.
- [ ] New publication/entry containment time recorded.
- [ ] Affected jobs, forecasts, positions, roots, versions, and last valid cutoff
      identified.
- [ ] Existing ledger evidence preserved; corrections appended.
- [ ] Root cause and provider/platform evidence recorded without payloads or
      secrets.
- [ ] Recovery used idempotent reconciliation and duplicate checks.
- [ ] Stale/failed/unverified public state verified.
- [ ] Budget, rights, model contract, and database integrity rechecked as
      applicable.
- [ ] Resume decision and any permanently excluded cohort recorded.
- [ ] Independent review and follow-up owner/date recorded.
