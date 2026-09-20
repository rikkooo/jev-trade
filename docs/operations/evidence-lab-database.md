# Evidence Lab database boundary

Issue #15 adds the fixture-safe Phase Two registry ledger through migration
`0002_evidence_lab_registry`. It is additive to the v0.1 ledger: it does not
create runs, arms, positions, executions, outcomes, reports, API routes, or
live-provider access.

## Runtime privilege matrix

| Role | Allowed | Forbidden |
| --- | --- | --- |
| `jev_public_reader` | `SELECT` from the rights-cleared `p2_public_evidence_projection` only; it is empty until a later public-mode gate supplies a safe projection | All base tables, protected payloads, mutation procedures, grants, ownership, and schema changes |
| `jev_public_ingest` | No Evidence Lab ledger capability in U5 | All Phase Two reads and writes, including source or cohort ingestion |
| `jev_worker` | `p2_append_source_revision`, `p2_append_evidence_state`, and `p2_read_evidence_state` | Registry/cohort controls, publication receipts, direct-table access, update/delete/truncate, grants, ownership, and schema changes |
| `jev_operator` | Named append procedures for registry entries/events, cohorts/events, source revisions, audit events, and publication receipts | Direct-table access, update/delete/truncate, grants, ownership, migration role membership, and schema changes |
| Migration owner | Explicit `pnpm db:migrate` execution with `DATABASE_MIGRATION_URL` | Runtime web, cron, worker, or public use |

All Evidence Lab evidence rows have both revoked runtime table privileges and an
append-only trigger. A correction is a new source/cohort event linked to the
predecessor; it never rewrites an earlier row.

## Server-only connection selection

Role-specific DAL modules must select one fixed server-owned role, never a role
supplied by a request. The matching connection setting is required only when
that DAL is invoked:

| Fixed DAL role | Required setting |
| --- | --- |
| operator | `OPERATOR_DATABASE_URL` |
| worker | `WORKER_DATABASE_URL` |
| public reader | `PUBLIC_DATABASE_URL` |

`DATABASE_URL` remains the v0.1 durable-write setting. Fixture mode continues
to start without any database URL. The migration-only URL stays outside runtime
configuration. Connection strings, prompts, licensed source payloads, request
headers, credentials, and secret-bearing audit inputs must not enter logs or
projection DTOs.
