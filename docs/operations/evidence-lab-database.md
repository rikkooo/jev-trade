# Evidence Lab database foundation

Issue [#15](https://github.com/rikkooo/jev-trade/issues/15) (U5) adds migration `0002_evidence_lab_registry`. It extends the v0.1 ledger and changes nothing in it. The migration creates the grammar that records Phase Two evidence and stores it append-only. It adds no runs, arms, positions, outcomes, reports, network routes, jobs, or live data access. The [salvage decision](evidence-lab-foundation-salvage.md) explains how this replaces Terra's draft `69a921e`.

## Record families

| Table | Holds | Written by |
| --- | --- | --- |
| `p2_operator_audit_events` | Every accepted operator command, recorded in the same transaction as its effect, and every rejected command, recorded on its own | Operator |
| `p2_registry_entries` / `p2_registry_events` | Content-addressed methodology manifests for 11 kinds, a `supersedes` link for corrections, and the `DRAFT → VALIDATED → APPROVED → RETIRED` lifecycle. Approval needs a review reference. | Operator |
| `p2_cohorts` / `p2_cohort_registry_refs` | A frozen methodology: exactly one registry entry per slot, bound by id, kind, and content hash; a registry root hash; and a version chain | Operator |
| `p2_cohort_events` | Lifecycle, corrections, and the first-forecast lock | Operator (lifecycle); worker (lock) |
| `p2_source_revisions` | Point-in-time source metadata: publication, effective, ingestion, availability, and correction times, plus a payload hash. The raw payload is never stored here. | Worker |
| `p2_evidence_states` / `p2_evidence_state_admissions` | One normalized state per cutoff, its admitted revisions, and reassessment and correction links | Worker |
| `p2_publication_receipts` | What was observed from the independent timestamp sink: a receipt, a missing receipt, or a failed submission | Worker |

Every table rejects `UPDATE`, `DELETE`, and `TRUNCATE` from every role, the migration owner included. A correction or reassessment is a new row linked to its predecessor. Each predecessor can have only one successor of each link kind, so chains stay linear.

## Hash contract

Each row stores `canonical_payload`, the envelope `{"kind", "payload", "recipe": "jev-evidence-lab-canonical-json/v1"}`, and `content_hash`, its SHA-256. Keys are sorted by code unit and there is no whitespace. TypeScript seals records with the locale-independent `modules/ledger/canonical-json`, never `modules/judgment/canonical.ts` (#31). PostgreSQL re-serializes each payload with `p2_canonical_json` and rejects any byte difference, so non-canonical text for the same content is refused. `assertDatabaseCanonical` refuses values PostgreSQL cannot reproduce exactly, such as exponent-form numbers, NUL, lone surrogates, and astral-plane keys.

The integration suite drives the committed golden fixture through the database procedures and checks that every stored hash equals the value in `tests/fixtures/evidence-lab/foundation-hashes.json`.

Derived hashes use their own recipes: the registry root (`jev-evidence-lab-registry-root/v1`), the admission manifest (`…admission-manifest/v1`), the normalized state (`…normalized-state/v1`), and the command request (`…command-request/v1`). The command-request hash ties an audit event to the exact content of its target.

## Error contract

| SQLSTATE | `EvidenceLabError` code | Meaning |
| --- | --- | --- |
| `22023`, `23514`, `22P02` | `VALIDATION` | Malformed, non-canonical, or out-of-contract input |
| `23505` | `CONFLICT` | Different content under an existing id, version label, or idempotency key |
| `23503` | `MISSING_REFERENCE` | Unknown predecessor, registry entry, or source |
| `55000` | `ILLEGAL_TRANSITION` | Lifecycle violation, a lock that has already been taken, or an attempt to mutate a row |
| `JTG01` | `GATED` | A capability held closed by a Phase Two gate |
| `42501` | `FORBIDDEN` | Role denial |

`fromDatabaseError` forwards only these classes. Any other driver text becomes `database operation failed`, so connection details cannot leak.

## Privilege matrix

No runtime role has any direct table, column, or sequence privilege on a Phase Two object. Every capability goes through a named `SECURITY DEFINER` procedure with a fixed `search_path`.

| Role | Phase Two capability |
| --- | --- |
| `jev_public_reader` | None. Public v2 projections wait for the public-mode gate. |
| `jev_public_ingest` | None |
| `jev_worker` | `p2_append_source_revision`, `p2_append_evidence_state`, `p2_append_publication_receipt`, `p2_record_first_forecast_lock`, `p2_read_source_revisions_as_of`, `p2_read_evidence_state`, `p2_read_registry_entry_status`, `p2_read_cohort_status`, `p2_read_receipt_authority` |
| `jev_operator` | `p2_append_registry_entry`, `p2_append_registry_event`, `p2_append_cohort`, `p2_append_cohort_event`, `p2_append_rejected_operator_command`, `p2_read_registry_entry_status`, `p2_read_cohort_status`, `p2_read_receipt_authority` |
| Migration owner | Owns the schema and runs `pnpm db:migrate`. Never a runtime connection. Its UPDATE, DELETE, and TRUNCATE are rejected by the same triggers. |

The operator cannot write receipts, source data, or forecast locks. The worker cannot change the registry or cohorts.

## Server-only connections

Durable mode now requires `OPERATOR_DATABASE_URL`, `WORKER_DATABASE_URL`, and `PUBLIC_DATABASE_URL`, and rejects the retired single `DATABASE_URL`. Each role URL must be a distinct credential, and none may equal `DATABASE_MIGRATION_URL`. Resolution is split across `operatorDatabaseUrl`, `workerDatabaseUrl`, and `publicDatabaseUrl` in `modules/config/database.ts`. None takes a role argument, so no request header, cookie, or body can select a role.

A missing credential throws `DatabaseRoleConfigurationError` before any connection opens. `modules/evidence-lab/dal/connections.ts` binds the operator and worker stores to their own URLs. Each login role should be a member of exactly one capability role; the integration suite proves that a login cannot `SET ROLE` into another runtime role or into the migration owner.

## Gates held closed

- **Prospective activation.** `ACTIVATION_SCHEDULED` on a prospective cohort raises `JTG01` even when every registry entry is approved and the pack profile holds values selected from training data. The readiness receipts from #26, #14, and #30 must first land in a later migration.
- **Prospective evidence.** A prospective evidence state raises `JTG01`. Source origins are limited to `FIXTURE` and `SYNTHETIC`; licensed and live origins wait for the #14 rights migration, which must also enforce `ingested_at <= cutoff` for prospective admissions.
- **Receipt authority.** `claimed_status` (`TIMELY`, `LATE`, `MISSING`, `FAILED`) is a stored column the database computes from the sink's timestamp and the deadline. No caller supplies it. `p2_read_receipt_authority` returns `authoritative = false` for every row, with `INDEPENDENT_SINK_VERIFICATION_UNAVAILABLE`, until the verifier in #30 exists. A `MISSING` observation can be recorded only after its deadline. A later observation must link the batch's previous observation and keep its root and deadline, so a late recovery never backdates authority.
- **Methodology placeholders.** A prospective cohort cannot be approved while its pack profile carries `FIXTURE_PLACEHOLDER` values, and it must preregister at least the P2-R45 evidence floor.

## Verification

```bash
pnpm db:migrate                       # exact-once, advisory-locked, checksum-pinned
pnpm db:verify                        # schema, grants, triggers, plus evidence-lab-integrity
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f tests/db/evidence-lab-foundation.sql
EVIDENCE_LAB_DATABASE_URL="$DATABASE_MIGRATION_URL" EVIDENCE_LAB_REQUIRE_DATABASE=true \
  pnpm exec vitest run --config vitest.integration.config.ts tests/integration/evidence-lab-database.test.ts
tests/db/rehearse-evidence-lab-upgrade.sh   # needs an EMPTY disposable database
```

The `evidence-lab-integrity` group runs read-only and checks every stored row. It recomputes each seal and each registry root and admission manifest, confirms that every caller-supplied typed column still equals its sealed payload, and confirms that no held gate has been bypassed. It therefore detects a tampered row even if an owner disabled a trigger, edited the row, and re-enabled the trigger. The database-assigned `recorded_at`, `observed_at`, and `seq` values are not sealed; only the append-only triggers protect them. The verifier and the runner both refuse a database that records a migration absent from the reviewed manifest.

The denial suite covers the four runtime roles and the migration owner. For every Phase Two table it attempts SELECT, DELETE, and TRUNCATE. For every function a role was not granted, it attempts a call with non-null arguments. It also exercises owner mutation, row and commit-time triggers under direct inserts, receipts carrying a self-asserted status or non-canonical text, and receipt writes by the operator. It leaves no rows behind.

## Rollback policy

Recovery is forward-only once evidence exists.

- **Before any Phase Two row exists,** `db/migrations/0002_evidence_lab_registry.down.sql` may remove the schema on a disposable or isolated branch. It refuses if any Phase Two table holds a row.
- **After evidence exists,** pause scheduling, stop publication, and serve the last validated projection or fixture deployment. Then repair with a new migration. Never edit an applied file. Never delete or rewrite evidence.
- **Application rollback needs no schema rollback.** The rehearsal runs the v0.1 release verifier (`c75b9aa`) against the expanded schema, and it passes.

The rehearsal migrates to the released v0.1 shape, populates it with the v0.1 ledger suite, and upgrades. It then proves that every v0.1 row and `read_public_forecasts()` are byte-identical, and that the v0.1 release verifier passes. Finally it exercises rollback before evidence exists and the refusal after.

## Owned elsewhere

- #16: runs, arms, publication batches, and binding a receipt to its batch
- #17: routes and jobs
- #30: independent receipt verification
- #14: rights-cleared origins
- #26: readiness receipts
