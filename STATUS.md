# Jev Trade status

- **Updated:** 2026-09-24
- **Active goal:** [Phase Two](GOAL.md), with Sol orchestration and direct Opus 5.5 execution/DD under an independent-lineage rule
- **Active milestone:** [v0.2.0 — Evidence Lab](https://github.com/rikkooo/jev-trade/milestone/1)
- **Program epic:** [#28](https://github.com/rikkooo/jev-trade/issues/28)
- **Program build candidate:** `0.2.0-alpha.1` in [PR #29](https://github.com/rikkooo/jev-trade/pull/29); GitHub records its current merge state
- **Next executable card:** [#15](https://github.com/rikkooo/jev-trade/issues/15) salvage on the existing isolated worktree, with Grok cold DD before merge

## Current position

The founder reaffirmed the Phase Two product goal and authorized Opus 5.5, reached directly through Claude Code on this box, for execution and for independent review of non-Claude-authored cards. Sol retains orchestration and release decisions. A [read-only Opus roadmap review](docs/reviews/2026-09-24-opus-roadmap-review.md) found the product contract sound and identified overstated readiness, a stranded #15 branch, and unowned chronology work. The roadmap and issue cards now make those gates visible.

The public deployment was checked on 2026-09-24: `/api/health` reports fixture mode, revision `c75b9aa26f8f`, and all database, durable-write, public-market-data, and live-judgment capabilities false. The frozen v0.1.0 validation target is `c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9`. No Phase Two predictor or live market-data behavior is deployed. Brokerage, deposits, real order execution, and personalized allocation are absent.

## Evidence and worktree state

| Card                                                  | Verified artifact                                                         | Current state                                                       | Next gate                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [#10](https://github.com/rikkooo/jev-trade/issues/10) | Goal, requirements, roadmap, status, issues, and version policy in PR #29 | Governance candidate; GitHub link gives current state               | Final Grok DD, green head checks, then merge/close                                                                              |
| [#11](https://github.com/rikkooo/jev-trade/issues/11) | Opus5 audit at `ad1e2d5`: 0 blocker, 3 major, 8 minor                     | Committed in isolated worktree; no PR or acceptance DD              | Land report; triage [#31](https://github.com/rikkooo/jev-trade/issues/31)–[#33](https://github.com/rikkooo/jev-trade/issues/33) |
| [#12](https://github.com/rikkooo/jev-trade/issues/12) | Grok 4.6 UI audit at `339e328`: 8 major, 7 minor                          | Committed in isolated worktree; no PR or acceptance DD              | Land report; fix [#34](https://github.com/rikkooo/jev-trade/issues/34)                                                          |
| [#14](https://github.com/rikkooo/jev-trade/issues/14) | Data-readiness research at `7199c1b`; all packs marked fixture-only       | Draft is incomplete against widened U4 scope; no clearance          | Remove overstated legal/runtime labels, fill input gaps, then source-trace DD                                                   |
| [#13](https://github.com/rikkooo/jev-trade/issues/13) | Reconciliation protocol and register skeleton at `1221192`                | In progress; no founder or five-participant results                 | Import audit rows and founder evidence without erasing dissent                                                                  |
| [#15](https://github.com/rikkooo/jev-trade/issues/15) | Mixed-lineage Terra/Opus draft at `69a921e`; TypeScript check only        | Stranded partial implementation; no migration or full gate evidence | Opus salvage, full gates, fresh Grok 4.6 DD                                                                                     |
| [#30](https://github.com/rikkooo/jev-trade/issues/30) | Timestamp-sink card                                                       | Not implemented                                                     | Independent proof required before authoritative prospective cohort                                                              |

## Holds and blockers

- **Governance landing — Sol:** #10 acceptance requires the current PR head to merge with independent DD and green checks. The public deployment remains v0.1.0 until separately released.
- **Storage — Sol/HQ operator:** the HQ filesystem had about 1.3–1.4 GB free (99% used) at this review. A prior container gate could not be verified. Recover capacity before migration and container acceptance tests; preserve audit artifacts before cleanup.
- **Audit evidence — Sol:** 30 #11 raw logs were copied to the private durable directory `/home/admin/jev-trade-evidence/issue-11/raw` with a SHA-256 manifest; verify and sanitize them before any public attachment. The source remains under `/tmp` for the original audit trace.
- **Data rights and spend — founder plus #14 owner:** no executed provider contract or founder spend approval is recorded. Every pack remains fixture-only; advertised terms and prices are research inputs, not granted rights. A model DD checks traceability, while executed terms or counsel determination plus founder acceptance clear use-specific rights.
- **Runtime and inputs — #14 owner:** Scalping latency/depth, short-borrow and locate inputs, survivorship-free universe handling, and per-pack benchmark evidence remain unresolved. A synthetic borrow assumption must be labeled and cannot support an empirical short-execution claim.
- **Prospective chronology — #30 owner:** independent batch-root timestamping and verification are not implemented; missing or late receipts cannot count as authoritative prospective evidence.
- **Human comprehension — founder and #13 owner:** the uncoached five-participant gate has no recorded results.
- **Terra capacity — Sol:** its current availability is unverified after #15 stalled. Do not depend on Terra as an active worker until the seat and quota are checked.
- **Future products — founder:** public predictor service and learner-triggered paper automation are held behind later evidence/product gates. Phase Two schedules only operator-run research cohorts. Brokerage, deposits, custody, personalized allocation, and real-money execution are outside Phase Two; real-money automation is outside the committed roadmap.

## Immediate sequence

1. Finish the #10 governance revision and merge PR #29.
2. Land and independently review #11, #12, and #14 without promoting their unverified claims; open and triage their fix cards.
3. Run Opus 5.5 at `high` effort in the #15 worktree. Treat the existing mixed-lineage commit as input, not accepted code; Sol commissions a fresh Grok 4.6 DD on the exact result.
4. Start #13 reconciliation as audit artifacts land. Founder and participant decisions remain pending until real observations exist.
5. Continue the fixture experiment spine. Do not call any cohort prospective-authoritative until #30, rights, and pack gates pass.

## Decision state

- **Known:** the currently deployed v0.1.0 fixture product is still simulation-only; separate cold audits found material release and UI defects.
- **Unknown:** whether Jev improves forecasting or simulated results beyond equivalent deterministic and naive controls.
- **Evidence rule:** historical replay is exploratory; only preregistered, timely externally attested forward cohorts may support prospective claims.
- **Required final decision:** `GO`, `ADJUST`, `STOP`, or `NOT ENOUGH EVIDENCE` for each pack and proposed next product stage.

Update this file after each merge, material audit finding, activation decision, or deployment change. `GOAL.md` retains the program contract, `ROADMAP.md` the execution order, and `CHANGELOG.md` release history.
