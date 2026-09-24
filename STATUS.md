# Jev Trade status

- **Updated:** 2026-09-24
- **Active goal:** [Phase Two](GOAL.md), with Sol orchestration and direct Opus 5.5 execution/DD under an independent-lineage rule
- **Active milestone:** [v0.2.0 — Evidence Lab](https://github.com/rikkooo/jev-trade/milestone/1)
- **Program epic:** [#28](https://github.com/rikkooo/jev-trade/issues/28)
- **Repository build:** `0.2.0-alpha.3` for the #12 UI audit landing; [PR #35](https://github.com/rikkooo/jev-trade/pull/35) merged the `0.2.0-alpha.2` code audit
- **Active execution:** [#15](https://github.com/rikkooo/jev-trade/issues/15) candidate in draft PR #36; [#12](https://github.com/rikkooo/jev-trade/issues/12) UI audit acceptance through Opus cold DD

## Current position

The founder reaffirmed the Phase Two product goal and authorized Opus 5.5, reached directly through Claude Code on this box, for execution and for independent review of non-Claude-authored cards. Sol retains orchestration and release decisions. The goal and governance contract passed an independent Grok 4.6 DD on head `683a27c` and merged through [PR #29](https://github.com/rikkooo/jev-trade/pull/29) at `8040b97`. The roadmap and issue cards make audit, data-rights, chronology, and predictor gates visible.

The public deployment was checked after #11 merged on 2026-09-24: `/api/health` reports fixture mode, revision `1ef34634bb5c`, and all database, durable-write, public-market-data, and live-judgment capabilities false. The frozen v0.1.0 validation target is `c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9`. No Phase Two predictor or live market-data behavior is deployed. Brokerage, deposits, real order execution, and personalized allocation are absent.

## Evidence and worktree state

| Card                                                  | Verified artifact                                                                                 | Current state                                                      | Next gate                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#10](https://github.com/rikkooo/jev-trade/issues/10) | PR #29, green CI, Grok 4.6 final PASS receipt at `683a27c`                                        | Merged at `8040b97` as `0.2.0-alpha.1`                             | Execute its audit and evidence cards                                                                                                                      |
| [#11](https://github.com/rikkooo/jev-trade/issues/11) | Opus5 audit at `44b37f2`: 0 blocker, 3 major, 8 minor; 50-row JSON index                          | Merged PR #35 as `0.2.0-alpha.2`; DD receipts archived privately   | Triage [#31](https://github.com/rikkooo/jev-trade/issues/31)–[#33](https://github.com/rikkooo/jev-trade/issues/33)                                        |
| [#12](https://github.com/rikkooo/jev-trade/issues/12) | Grok 4.6 submitted 8 major and 7 minor findings; Opus DD disputes F01 and challenges F06 severity | Revision after independent DD; final exact-head acceptance pending | Preserve dissent in [#13](https://github.com/rikkooo/jev-trade/issues/13); triage accepted fixes in [#34](https://github.com/rikkooo/jev-trade/issues/34) |
| [#14](https://github.com/rikkooo/jev-trade/issues/14) | Opus/Gemini/Sol branch; schema repair `040f6c2`                                                   | Partial schema repair; source claims and Grok DD remain            | Repair fail-open schema, source claims, field inventory, and defaults; fresh Grok DD                                                                      |
| [#13](https://github.com/rikkooo/jev-trade/issues/13) | Reconciliation protocol and register skeleton at `1221192`                                        | In progress; no founder or five-participant results                | Import audit rows and founder evidence without erasing dissent                                                                                            |
| [#15](https://github.com/rikkooo/jev-trade/issues/15) | Opus salvage `53b6395` in draft PR #36; local gates reported                                      | CI and Grok DD pending; unaccepted                                 | Exact-head CI, independent Grok DD, and next unused version                                                                                               |
| [#30](https://github.com/rikkooo/jev-trade/issues/30) | Timestamp-sink card                                                                               | Not implemented                                                    | Independent proof required before authoritative prospective cohort                                                                                        |

## Holds and blockers

- **Audit findings — Sol/Grok:** #11 passed independent DD and merged through PR #35. Its three major findings remain separate open fixes. Public app behavior is still the v0.1.0 fixture release; no Phase Two predictor is deployed.
- **Storage — Sol/HQ operator:** the HQ filesystem had about 1.3–1.4 GB free (99% used) at this review. A prior container gate could not be verified. Recover capacity before migration and container acceptance tests; preserve audit artifacts before cleanup.
- **Audit evidence — Sol:** 30 #11 raw logs were copied to the private durable directory `/home/admin/jev-trade-evidence/issue-11/raw` with a SHA-256 manifest; verify and sanitize them before any public attachment. The source remains under `/tmp` for the original audit trace.
- **Data rights and spend — founder plus #14 owner:** no executed provider contract or founder spend approval is recorded. Every pack remains fixture-only. The `1af1350` candidate drew eight major findings in an Opus advisory review; older Opus co-authored commits disqualify that review as independent DD. Advertised terms are research inputs, not granted rights. Fresh Grok DD checks traceability, while executed terms or counsel determination plus founder acceptance clear use-specific rights.
- **Runtime and inputs — #14 owner:** Scalping latency/depth, short-borrow and locate inputs, survivorship-free universe handling, and per-pack benchmark evidence remain unresolved. A synthetic borrow assumption must be labeled and cannot support an empirical short-execution claim.
- **Prospective chronology — #30 owner:** independent batch-root timestamping and verification are not implemented; missing or late receipts cannot count as authoritative prospective evidence.
- **Human comprehension — founder and #13 owner:** the uncoached five-participant gate has no recorded results.
- **Terra capacity — Sol:** its current availability is unverified after #15 stalled. Do not depend on Terra as an active worker until the seat and quota are checked.
- **Future products — founder:** public predictor service and learner-triggered paper automation are held behind later evidence/product gates. Phase Two schedules only operator-run research cohorts. Brokerage, deposits, custody, personalized allocation, and real-money execution are outside Phase Two; real-money automation is outside the committed roadmap.

## Immediate sequence

1. Land #12 only after Opus DD, preserve its human-comprehension and screen-reader limitations, and triage #31–#34.
2. Correct #14's eight major advisory findings and request full-branch Grok DD before any data-readiness card is accepted.
3. Review the Opus 5.5 #15 candidate in draft PR #36 against exact-head CI and fresh Grok 4.6 DD; treat the old mixed-lineage draft as unaccepted input.
4. Start #13 reconciliation as audit artifacts land. Founder and participant decisions remain pending until real observations exist.
5. Continue the fixture experiment spine. Do not call any cohort prospective-authoritative until #30, rights, and pack gates pass.

## Decision state

- **Known:** the currently deployed v0.1.0 fixture product is still simulation-only; separate cold audits found material release and UI defects.
- **Unknown:** whether Jev improves forecasting or simulated results beyond equivalent deterministic and naive controls.
- **Evidence rule:** historical replay is exploratory; only preregistered, timely externally attested forward cohorts may support prospective claims.
- **Required final decision:** `GO`, `ADJUST`, `STOP`, or `NOT ENOUGH EVIDENCE` for each pack and proposed next product stage.

Update this file after each merge, material audit finding, activation decision, or deployment change. `GOAL.md` retains the program contract, `ROADMAP.md` the execution order, and `CHANGELOG.md` release history.
