# Evidence Lab foundation: salvage decision for Terra draft `69a921e`

- **Card:** [#15](https://github.com/rikkooo/jev-trade/issues/15), U5 of the Phase Two plan
- **Assessed:** 2026-09-24 by Claude Opus 5.5 (`claude-opus-5-5`), executor seat
- **Input:** `69a921e` on `feat/issue-15-foundation`, stranded when Terra's job exhausted its quota. It was never applied, run, or reviewed.
- **Decision:** **Partial salvage.** Keep the draft's layout, names, and the ideas that match the contract. Rewrite the migration, receipt model, cohort and registry invariants, projection guard, and database tests. The draft commit stays in history unchanged; this card's own commit supersedes it.

## Evidence

Checked on this box with Node 22.23.2, pnpm 12.4.2, and disposable `postgres:16.10-alpine`, the CI image:

| Check | Result on `69a921e` |
| --- | --- |
| `pnpm typecheck` | Pass |
| `pnpm test` | Pass: 41 files, 354 tests. The draft's tests only exercise TypeScript. |
| `pnpm db:migrate` on empty PostgreSQL | **Fails.** `unterminated quoted string` in `p2_append_evidence_state`, where `'contentHash` is never closed. The runner uses one transaction, so nothing applies, including v0.1. |
| Migration with only that typo patched (scratch copy) | Applies. |
| `tests/db/evidence-lab-foundation.sql` on the patched copy | **Fails.** `permission denied for table p2_source_revisions`: a `SET LOCAL ROLE` leaks into a later assertion. |
| CI database job | Would fail. It hard-codes 2 applied and 2 skipped migrations, and the draft adds a third. |

## Contract gaps found in the draft

1. **Receipts.** The operator could append a receipt and state its own `status`. `MISSING` and `FAILED` rows needed a `received_at`. The TypeScript schema rejected every status except `TIMELY`, so late, missing, and failed receipts could not be stored at all. Nothing separated a receipt the sink *claims* is timely from one that has been *verified*. This goes against P2-R57, KTD15, and #30.
2. **Cohorts.** `version_tuple` was free text, with no link to registry entries or their content hashes and no registry root. Nothing linked a cohort to a later version. The operator could append `FORECAST_LOCKED` itself. After the lock the cohort could not be paused or closed. Callers could backdate lifecycle order by choosing `effective_at`.
3. **Registry.** There was no link between an entry and the entry it corrects, and nothing stopped a version label from mapping to two payloads. Approval needed no review reference. Lifecycle order also depended on `effective_at` set by the caller.
4. **Source revisions and evidence states.** A state could admit a revision that had been superseded before its cutoff. A prospective state could admit data ingested after its cutoff. There were no reassessment or correction links between states. Admissions were not tied to source content hashes.
5. **Provenance fields.** There were no `risk` or `api` versions and no shared prediction provenance contract. Pack profiles held only horizons: no inputs, costs, baselines, resolution rules, short-availability, or session rules. There were no simulated execution action types.
6. **Projection.** `safeEvidenceProjection` quietly dropped keys that matched a denylist. It did not detect secret *values*, such as a credentialed URL, a bearer token, an API key, or a configured secret, placed under a harmless key.
7. **Hashing.** The database accepted any JSON text equal to the payload, canonical or not. Nothing checked TypeScript hashes against PostgreSQL.
8. **Roles and config.** There was no denial suite for the migration role, no probe for SET ROLE across login roles, and the operator held receipt authority. `DURABLE_WRITES` still required only the single `DATABASE_URL`, so a missing role-specific credential did not stop a deployment. Nothing kept a runtime URL from reusing the migration owner.
9. **Migration evidence.** No test covered an upgrade from a v0.1 database holding data, and there was no written rollback policy for after evidence writes.

## What is kept

- The file layout from the plan: `db/migrations/0002_evidence_lab_registry.up.sql`, `db/schema/evidence-lab.ts`, `modules/evidence-lab/{contracts,registry}`, `tests/db/evidence-lab-foundation.sql`, and the migration manifest entry. The lifecycle rules that lived in `state/` now sit beside their schemas in `modules/evidence-lab/model/`.
- The `p2_*` table set, the `reject_immutable_mutation` trigger pattern, SECURITY DEFINER procedures with a fixed `search_path`, and the idea of extending the verifier.
- The pack stance and action vocabularies, the four horizon sets, the tolerance for normalizing probabilities, and the hash envelope `jev-evidence-lab-canonical-json/v1` built on the locale-independent `modules/ledger/canonical-json`. It does **not** use `modules/judgment/canonical.ts`, which is #31's to fix.
- The environment keys `OPERATOR_DATABASE_URL`, `WORKER_DATABASE_URL`, and `PUBLIC_DATABASE_URL`.

## Outcome

The rewrite addresses each gap above. Verification against a real database then caught three defects in the rewrite itself. Each was fixed before the commit and now has a regression test:

- PL/pgSQL variables shadowed a column name and a table alias (`payload`, `ref`), so two procedures could not run.
- A `{1,500}` regex repeat exceeded PostgreSQL's limit of 255, so every reason field was rejected.
- The projection guard echoed an offending key into its error message, leaking the value it had blocked.

The tests that pin the fixes are the SQL denial suite, `tests/integration/evidence-lab-database.test.ts`, and `modules/evidence-lab/projections/projections.test.ts`. [`evidence-lab-database.md`](evidence-lab-database.md) is the record of the implementation. The card's handoff lists the exact gates that ran and anything not verified.

## Still outside this card

- Runs, arms, the Jev artifact, publication batches, and binding a batch to its receipt: #16.
- Verifying a sink proof and granting receipt authority: #30. Until #30 lands, **no receipt is authoritative**, whatever status the sink claims.
- Network routes, job execution, and public v2 reads: #17. The public reader has no Phase Two capability in this card.
- Live sources or licensed replay: gated by #14 and a later migration. This migration allows only `FIXTURE` and `SYNTHETIC` sources.
