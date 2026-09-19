# Jev Trade operations

These runbooks operate the Vercel-first prototype defined by
[`ADR 0001`](../decisions/0001-vercel-first-runtime.md). They do not change the
product contract in the canonical plan.

## Operating modes

| Mode | Public market data | Durable writes | Paid Jev calls | What it may claim |
|---|---:|---:|---:|---|
| Fixture demonstration | No | No | No | Synthetic, read-only demonstration; browser picks are local |
| Restricted live | Contract-dependent and access-restricted | Yes | Yes | Private validation only; not public prospective evidence |
| Public live | Yes, after the rights gate | Yes | Yes | Prospective simulation under the active versions and disclosures |

The safe fallback is always fixture mode:

```text
APP_MODE=fixture
PUBLIC_MARKET_DATA=false
DURABLE_WRITES=false
```

The application is simulation-only in every mode. It never sends a real order,
accepts money, or provides personalized allocation advice.

## Runbook index

- [Fixture deployment](fixture-deployment.md): Vercel and local Docker build,
  deploy, verification, and receipts.
- [Secrets](secrets.md): inventory, storage, rotation, revocation, and exposure
  response.
- [Neon and Postgres](database.md): provisioning, migrations, roles, backups,
  restore rehearsal, and recovery.
- [Rollback](rollback.md): application rollback and expand/contract database
  compatibility.
- [Incidents](incidents.md): provider and Jev outages, budgets, stale data,
  Cron/attestation failures, and storage failures.
- [Version activation](version-activation.md): safe activation of model,
  state/question, and policy versions at a cohort boundary.
- [Public-mode gate](public-mode-gate.md): market-data rights and the release
  sequence for public live data and later promotion.

## Command conventions

Run repository commands from the repository root with Node.js 22 and the pinned
pnpm version. Text such as `<DEPLOYMENT_URL>` is a placeholder and must be
replaced. Commands beginning with `# FUTURE` describe a required operator CLI
contract that is not yet present; they are not executable until the named script
exists in `package.json`.

Never paste a credential into a command line, issue tracker, receipt, chat, or
committed file. Use a hidden prompt, a protected secret store, or the provider
dashboard. Do not use `set -x` in a shell handling credentials.

## Receipt standard

Every deployment, activation, recovery, and incident creates a redacted receipt
outside Git history, for example:

```text
artifacts/operations/<UTC-DATE>/<operation-id>/receipt.md
```

The receipt records:

- operation ID, UTC start/end, operator, environment, and ticket/reason;
- source commit SHA, deployment ID, and application/schema versions;
- commands run, with secrets and connection strings replaced by `[REDACTED]`;
- pass/fail for each checklist item and links to provider-side evidence;
- forecast/job/root IDs affected, never licensed payloads;
- rollback target and whether rollback was exercised;
- reviewer and review time.

Store raw command output only when it contains no secrets, authorization headers,
provider-native payloads, database URLs, or licensed data. A receipt is evidence
of an action after it is performed; an unchecked template is not evidence.

## Common safety rules

1. Preserve published forecasts, judgments, ledger events, corrections, and
   external attestation records. Corrections append; they do not rewrite.
2. Stop new publication and entry before investigating uncertain data or model
   behavior. Existing deterministic stop/horizon processing may continue if its
   required market data is valid.
3. Never switch a scored cohort to a fallback model, question set, provider, or
   policy silently.
4. Treat Vercel function memory and `/tmp` as disposable. Neon Postgres is the
   only authority in durable mode.
5. Keep `PUBLIC_MARKET_DATA=false` until the recorded rights gate passes. A
   successful Vercel deployment or valid API key does not grant display rights.
6. Rolling back the application does not roll back Postgres. Use the database
   recovery process and preserve the original ledger.

