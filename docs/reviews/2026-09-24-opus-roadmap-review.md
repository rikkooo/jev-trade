<!-- Read-only advisory snapshot from direct Claude Code. Current status lives in STATUS.md. -->

# Jev Trade Phase Two: roadmap and execution review

Scope: read-only. I made no edits, commits, pushes or messages. `[E]` marks findings I verified in this session. `[J]` marks my judgment.

## 1. Verdict

**Adjust. The plan is credible only after corrections.** The product contract (`GOAL.md`, `VISION.md`, the Phase Two plan) is sound and keeps every boundary you named. The execution surface does not:

- **Status overclaims.** Documents call things complete or ready that are neither.
- **Independence breaks.** Opus is the cold reviewer on most cards, so Opus 5.5 executing would mean Opus reviewing Opus.
- **Unowned gates.** Three requirements for authoritative prospective evidence have no card: a timestamp sink, a source for short-borrow data, and bought data rights.
- **Honest forecast [J]:** the software can be finished. Every pack stays `NOT ENOUGH EVIDENCE` until the founder decides to buy data. That fact should appear in `STATUS.md`.

## 2. Verified current state [E]

- **Nothing from Phase Two is on `main`.**
  - `main` is still `c75b9aa`, the v0.1.0 release.
  - `GOAL.md` and the Phase Two plan exist only on `docs/phase-two-program` (`fb667d1`).
  - PR #29 is **OPEN** and issue #10 is **OPEN**. Issues #10–#28 are all open.
  - The issue cards link to `blob/main/GOAL.md` and the plan, so those links are broken.
- **All five issue worktrees branch from the unmerged `fb667d1`.** None has a PR.

| Card | Worktree commit | What exists |
|---|---|---|
| #11 | `ad1e2d5` | Opus 5 audit: PASS WITH FINDINGS, 0 BLOCKER, 3 MAJOR, 8 MINOR. MAJOR-1: `modules/judgment/canonical.ts:39` sorts keys with `localeCompare`, so hashes differ by host locale. MAJOR-2: `verify:forecast` fails as documented and is not in CI. MAJOR-3: no v0.1.0 release receipt exists. Raw evidence logs sit only in `/tmp/jev-audit-c75b9aa/evidence` (uncommitted, volatile). |
| #12 | `339e328` | Grok 4.6 audit: 8 MAJOR (F01–F08), 7 MINOR. The 4-of-5 human comprehension gate is NOT VERIFIABLE (no participants, no screen reader). |
| #13 | `1221192` | Skeleton only: status `IN_PROGRESS`, every source `PENDING_IMPORT`, no founder or participant records. |
| #14 | `7199c1b` | All packs `FIXTURE_ONLY`. States plainly that no contract or spend exists. The report records no reviewer identity or model. |
| #15 | `69a921e` | Terra's work, stranded when its quota ran out after about 31 minutes. The commit says it was never run and never migrated. It carries a `Co-Authored-By: Claude Opus 5` trailer, so its provenance is mixed. **I ran `tsc --noEmit`: exit 0.** I did not run the tests or the migration. |

- **Disk:** `/` is 99% full with 1.3 GB free. This already made #11's container gate unverifiable.
- **Seats** (from the `remote_agents` registry):
  - Sol, Terra and Astra run on codex (OpenAI lineage).
  - Opus5, Fable5 and Sonnet5 are Claude.
  - Grok and Gemini report verifiable served models.
  - K3's served model is **unverifiable**.
- **HQ doctrine:** every canonical path named in `~/AGENTS.md` is missing (`hq-infra/README.md`, `NORTH.md`, `crew/crew.json`, `PROJECT.mm`, `CREW-DOCTRINE.mm`, `CONSTITUTION.mm`). I did not guess at their content.

## 3. Prioritized findings

**F1. The roadmap and status claim readiness and completion that don't exist. [E]**
- `ROADMAP.md:30` and `STATUS.md:27` say #10 is "Complete in alpha.1", citing "merged PR, issue #10 closed". Neither is true.
- `ROADMAP.md:31-33` lists #11, #12 and #14 as "Ready". They are drafted but unmerged and have no cold review on record.
- `ROADMAP.md:42` says #15 is "Ready for fixture work". It is stranded partial work.
- `STATUS.md:39` says "no blocker". Disk, Terra's quota and the unlanded PR #29 are all blockers.
- `CHANGELOG.md` records alpha.1 as released, and `STATUS.md` is dated 2026-09-20.

**F2. Opus 5.5 executing would collapse cold review. [E] facts, [J] remedy.**
- Opus5 is the cold reviewer on 14 of 18 cards (#12–#15, #17, #18, #20–#27) and re-verifies #11's fixes.
- Remedy [J]: for independence, treat every Claude seat as one lineage.

**F3. The #11 and #13 texts contradict each other on who re-verifies fixes. [E]**
- #11 audit, line 734: the reviewer "must not review a fix".
- The #11 card: "any fix is reviewed again by Opus5".
- #13 register: "the original cold lineage verified the fix".
- If Opus 5.5 authors the #11 fixes, every version of this rule ends in self-validation.

**F4. Nothing owns the timestamp sink for P2-R57. [E] facts, [J] severity.**
- Plan line 838 cites an "approved independent timestamp sink", but no card selects or builds one.
- The v0.1 plan's GitHub Actions + Sigstore design is never carried into Phase Two.
- Without receipts, no prospective row can be authoritative.

**F5. The stranded #15 contract breaks the chronology rule. [E]**
- `modules/evidence-lab/contracts.ts:337-344` rejects any receipt status other than `TIMELY`.
- The migration (line 120) allows `LATE`, `MISSING` and `FAILED`, and P2-R57/AE13 require late and missing receipts to stay visible.
- Migration line 471 lets the `jev_operator` role append receipts whose timeliness rests on self-reported times, so an operator can assert timeliness. [J] Receipts should be verified by the worker against a proof from the sink.
- `safeEvidenceProjection` (lines 442-459) redacts by key name only, the same pattern as #11 MINOR-2.
- Migration `0002` has no down migration.

**F6. No source is identified for short borrow, locate or hard-to-borrow data. [E] facts, [J] severity.**
- The #14 rights matrix and data dictionary contain no borrow source, though Day and Swing short simulations and "evidence-grounded" cost scenarios need one.
- Also missing: a survivorship-free universe source, and a source for the "supply-chain facts" in #21.
- #14 marks the runtime gate "PASS" without any benchmark.

**F7. Dependency and sequencing errors.**
- **[E]** #21 (Swing) is blocked only by #17, #19 and #20, not by #14. Plan U11 (line 547) also omits U4, while `GOAL.md:57` requires Swing to be ready for prospective cohorts.
- **[J]** The leakage suite U8/#18 waits on the API (U7), and execution U9 waits on U8 (plan lines 497-499). This delays the most important integrity guard and stacks it behind Terra. #18 should be split.

**F8. #14 labels itself canonical without verification. [E] facts, [J] risk.**
- It calls itself "Canonical Legal & Rights Audit" and cites "verified 2026-09-20" URLs, but has no dated snapshots or hashes and no cold review.
- It says itself that legal counsel must confirm.
- Its prices ($250/mo Tiingo and others) are unverified advertised figures.

**F9. Implementer capacity is a single point of failure. [E] facts, [J] risk.**
- Terra is primary on 9 cards and died on the first. Its commit says it is "unavailable until 2026-09-23 or a credit purchase"; current status is unknown.

**F10. A v0.1 defect flows into Phase Two. [E] facts, [J] risk.**
- MAJOR-1 (`modules/judgment/canonical.ts` builds the Jev request body) becomes live with the first real Jev call in #17.
- #15 correctly uses `modules/ledger/canonical-json`. Nothing yet stops later code from importing the bad canonicaliser.

**F11. The #13 reconciler shares a lineage with the likely v0.1 author. [J]**
- The v0.1 implementer's lineage is unrecorded (#11 §8). The `.codex` directory hints at codex/OpenAI.
- Sol, also codex, reconciles findings against that work. `ACCEPTED_RISK` and `INVALID` dispositions should need founder sign-off.

## 4. Proposed roadmap revisions

1. **T0 truth reset (Sol):**
   - Fix the F1 text, merge PR #29, close #10, and rebase the worktrees.
   - Add a "Blockers" section covering disk, Terra, procurement and the sink.
   - Free disk (operator/NC; archive, don't delete).
2. **Land the audits as-is:**
   - #11 and #12 go in as docs-only PRs.
   - Commit a SHA-256 manifest of the #11 `/tmp` logs and archive them durably.
3. **New fix cards:**
   - FX-1: MAJOR-1, plus a lint or grep guard against `modules/judgment/canonical.ts`.
   - FX-2: `verify:forecast` in CI and a corrected ID in the plan.
   - FX-3: a retrospective receipt or an accepted-risk record (operator + founder).
   - FX-UI: fixes for F01–F08.
4. **New card, chronology sink (P2-R57):**
   - Choose the sink, reusing the v0.1 Sigstore design.
   - Build the receipt verifier on the worker side.
   - Blocks #26 and any prospective cohort.
5. **Widen #14's scope:**
   - Add a borrow/locate source, or a preregistered conservative synthetic borrow model labeled as an assumption with prospective short claims held.
   - Add a survivorship-free universe source.
   - Replace "canonical" with dated evidence snapshots.
   - Change runtime "PASS" to "UNMEASURED".
6. **Link #21 as blocked by #14** for its readiness receipt.
7. **Split #18:**
   - #18a: state, registry and arm invariants, after #15 and #16.
   - #18b: API and job-race invariants, after #17.
8. **Founder fork in `STATUS.md`:** no provider spend means no prospective cohort, which means `NOT ENOUGH EVIDENCE` for every pack.

## 5. Ownership: Opus 5.5 execution vs independent DD

**Rule:** if a Claude seat authors a card, no Claude seat cold-reviews it. Opus5 stays a valid DD only on cards authored outside Claude.

| Card | Author | Cold DD (fresh session, read-only) |
|---|---|---|
| PR #29 / T0 | Sol | Grok |
| #11 landing | Opus5 (done) | Sol, for evidence completeness |
| FX-1, FX-2 | Astra or Terra — **not Opus 5.5** | Opus5, the finder, per the card. Record that this overrides the report's line 734. If the founder upholds line 734, use K3 plus Grok instead. |
| FX-3 | Sol + founder | Opus5 |
| #12 landing | Grok (done) | Opus5 spot-check |
| FX-UI | **Opus 5.5** | Grok (the finder) |
| #13 | Sol + founder | Opus5 and Grok confirm their rows were imported verbatim; founder signs `ACCEPTED_RISK` and `INVALID` dispositions |
| #14 revision | Gemini | Opus5 for traceability; human counsel for rights |
| **#15** | **Opus 5.5** (salvage) | **Astra** primary, Grok backup. Not Terra, which wrote the stranded code; not Sol, the orchestrator. |
| #16 | Opus 5.5 | K3 plus Astra (K3 can't be sole DD because its model is unverifiable) |
| Sink card | Opus 5.5 | Grok plus K3 |
| #17 | Terra if available, else Opus 5.5 | If Opus 5.5 authors: Grok, not Opus5 |
| #18a/b | K3 | Astra or Grok, not Opus5 (the suite attacks Opus-authored substrate) |
| #19 onward | Balance Terra/Astra and Opus 5.5 | Swap per the rule |

**Independence protocol:**
- DD works in a fresh session with only the card, the diff, the repo and the anchors: no author handoff and no author conversation.
- DD runs read-only (codex `-s read-only`, Grok/Gemini `plan` mode).
- The served model is verified with `remote_agents check` before DD starts.
- The receipt goes to `docs/reviews/issue-N-cold-review.md` and records seat, served model, SHA, commands, verdict and severities.
- Every commit carries an authored-by-seat trailer (69a921e shows why).
- Authors never tick acceptance boxes or close issues. Merge needs the DD receipt plus Sol's approval.
- Keep a non-Claude implementer active on a share of cards so Opus5 stays usable as DD.

**Advisory session [J]:**
- Run one pinned Opus 5.5 advisory session (`--session-id`), separate from the Opus executor session.
- It advises Sol on sequence and scope, and never signs DD.
- Its state lives in the repo (e.g. `docs/governance/advisory-log.md`), not in the conversation.
- On every wake it re-reads `GOAL.md`, `ROADMAP.md` and `STATUS.md`.
- Cadence: after each merge, plus weekly.
- Record the role map in the jev-trade repo, since the HQ crew registry is missing.

## 6. First executable card: #15 salvage (Opus 5.5)

Start now in the #15 worktree. Merging waits for PR #29 and the disk fix.

**Exit criteria:**
1. A written salvage-or-redo decision based on a review of `69a921e`, with provenance trailers normalized.
2. Rebased onto `main` carrying alpha.1.
3. The receipt contract accepts all four statuses as evidence; only `TIMELY` rows are authoritative; there are AE13 tests.
4. Operators cannot assert a timely receipt. Receipts either come from the worker with a sink-proof stub, or are marked `UNVERIFIED` until the sink card lands.
5. Migration `0002` gets a down migration, or a forward-only rationale consistent with plan §Runtime.
6. From a clean checkout, all gates pass: format, lint, typecheck, test, test:integration, build and e2e, plus `db:migrate`, `db:verify` and `verify:forecast` on a disposable Postgres 16 with least-privilege roles.
7. The five-role SQL denial suite passes. Migration works on both an empty database and a v0.1-populated one, and v0.1 replay stays green.
8. The fixture deployment starts with no database URLs. A missing role URL fails closed only when that DAL is called. No request can select a database role.
9. A guard test proves no evidence-lab import of `modules/judgment/canonical.ts`.
10. Projection snapshot tests include value-based leak probes, not just key-name checks.
11. An Astra DD receipt exists, with every BLOCKER and MAJOR resolved.
12. The next alpha build is assigned at merge, and `VERSION`, `package.json`, `CHANGELOG.md`, `ROADMAP.md` and `STATUS.md` are updated together.

## 7. Remaining unknowns

- Whether Terra's quota is back.
- The lineage of the v0.1 implementer.
- Whether #14's prices and rights claims are accurate (no counsel review, no snapshots).
- Whether the founder will approve any spend. No provider contract exists, and I have not assumed one.
- Whether v0.1's attestation pipeline was ever implemented (not checked).
- Whether any cold review of #11, #12 or #14 happened (none found).
- Whether #15's tests and migration pass (only `tsc` was run).
- K3's actual model.
- The Jev inference budget.
- Who owns HQ disk capacity.
- The missing HQ doctrine files.

No efficacy evidence exists. The v0.1 scorecard has zero prospective samples.

---

## Orchestrator disposition (2026-09-24)

This review is a dated advisory snapshot, not the current authority for issue state, provider rights, or acceptance. Sol adopted the status correction, cross-lineage DD rule, #15 salvage gate, #30 independent chronology card, #31–#34 remediation cards, and the #21/#26 dependency updates in the revised goal, roadmap, plan, and GitHub issues.

Three suggestions were narrowed. Provider **spend** is not itself a universal prerequisite for a prospective cohort; the actual gate is documented rights for the specific fields, model use, retention, display, and intended cohort, plus runtime and chronology evidence. No such activation is currently evidenced. The existing #18 card remains accountable for both early contract invariants and later API/job-race tests; splitting it is optional if execution demonstrates a real need. A database down migration is useful before Phase Two evidence is written, but after evidence exists the plan requires forward-only recovery, so #15 must document and test the permitted rollback window rather than promise destructive schema reversal.

The review's model-seat registry and missing-HQ-doctrine observations are environmental snapshots. They do not alter Jev Trade's repo-local authority order. `STATUS.md` is the current source for work state; issue cards and verified receipts determine acceptance.
