# Jev Trade roadmap

`VISION.md` defines where the product is going. `GOAL.md` defines the active program. GitHub issues are the executable cards. This roadmap mirrors their order, dependencies, and release gates; `STATUS.md` records the current position.

## Release path

| Release         | Product outcome                                                                                | State                      | Advancement gate                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| v0.1.0          | Transparent public fixture prototype                                                           | Released                   | Frozen audit target at `c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9`                                   |
| v0.2.0          | Evidence Lab: independent validation, research predictor API, four packs, prospective evidence | Active                     | Signed per-stage `GO`, `ADJUST`, `STOP`, or `NOT ENOUGH EVIDENCE` report                            |
| v0.3.0          | Public Tutor and Predictor Service                                                             | Gated                      | v0.2 public-predictor gate says go; data rights, auth, tenancy, quotas, and service limits approved |
| v0.4.0          | Bounded Paper Automation                                                                       | Gated                      | Relevant pack evidence, reliability, controls, and user comprehension say go                        |
| v1.0.0          | Trusted evidence-backed product                                                                | Uncommitted                | Product-market evidence and operations justify a stable contract                                    |
| Future decision | Any real-market automation                                                                     | Outside the active roadmap | Separate legal, regulatory, safety, capital-risk, and prospective-evidence decision                 |

Future releases are direction, not a promise. A stop decision can remove or reshape them.

## v0.2.0 — Evidence Lab

- **Milestone:** [v0.2.0 — Evidence Lab](https://github.com/rikkooo/jev-trade/milestone/1)
- **Program epic:** [#28](https://github.com/rikkooo/jev-trade/issues/28)
- **Release line:** `0.2.0-alpha.N` → `0.2.0-rc.N` → `0.2.0`

### Stage 0 — Lock and validate

The program contract is in [PR #29](https://github.com/rikkooo/jev-trade/pull/29), not yet on `main` at this review snapshot. Merge it before treating the child-card links or alpha.1 as landed. Audit artifacts exist on isolated branches; a committed report is not a merged or independently accepted issue.

| Card                                                  | Outcome                                                                | Primary worker   | Depends on | State                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- | ---------- | ----------------------------------------- |
| [#10](https://github.com/rikkooo/jev-trade/issues/10) | Lock goal, requirements, roadmap, status, issues, and release controls | Sol              | None       | PR #29 open; merge gate                   |
| [#11](https://github.com/rikkooo/jev-trade/issues/11) | Cold v0.1.0 code, release, security, and reproducibility audit         | Opus5            | #10        | Report committed in worktree; land and DD |
| [#12](https://github.com/rikkooo/jev-trade/issues/12) | Cold responsive UI/UX, accessibility, and comprehension audit          | Grok 4.6         | #10        | Report committed in worktree; land and DD |
| [#14](https://github.com/rikkooo/jev-trade/issues/14) | Provider rights, point-in-time semantics, and pack readiness matrix    | Gemini 3.8 Flash | #10        | Research committed; rights DD pending     |
| [#13](https://github.com/rikkooo/jev-trade/issues/13) | Reconcile cold audits and founder testing                              | Sol + founder    | #11, #12   | Skeleton only; human results pending      |

The independent validators do not fix the code they judge. Accepted fixes receive separate cards and cold reverification.

The first audit identified separate remediation cards: [#31](https://github.com/rikkooo/jev-trade/issues/31) for locale-independent Jev hashing, [#32](https://github.com/rikkooo/jev-trade/issues/32) for the forecast release gate, and [#33](https://github.com/rikkooo/jev-trade/issues/33) for the missing v0.1.0 release receipt. The UI audit's eight major findings are grouped in [#34](https://github.com/rikkooo/jev-trade/issues/34). Their acceptance evidence feeds #13; no retrospective receipt may be represented as contemporaneous.

### Stage 1 — Establish the experiment spine

| Card                                                  | Outcome                                                          | Primary worker                       | Depends on                  | State                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ | --------------------------- | ----------------------------------------------- |
| [#15](https://github.com/rikkooo/jev-trade/issues/15) | Versioned pack contracts and immutable evidence records          | Opus 5.5                             | #10; #14 for live semantics | Stranded Terra partial; salvage and rerun gates |
| [#16](https://github.com/rikkooo/jev-trade/issues/16) | Preregistered cohorts and four equivalent comparison arms        | Opus 5.5                             | #15                         | Blocked by dependency                           |
| [#17](https://github.com/rikkooo/jev-trade/issues/17) | Idempotent predictor jobs and versioned research API             | Opus 5.5                             | #15, #16, #31               | Blocked by dependency                           |
| [#18](https://github.com/rikkooo/jev-trade/issues/18) | Temporal leakage and adversarial invariant suite                 | Kimi K3                              | #15-#17                     | Blocked by dependency                           |
| [#19](https://github.com/rikkooo/jev-trade/issues/19) | Pack-aware policy, execution, reassessment, and outcome resolver | Terra or Opus 5.5, assigned at start | #17, #18                    | Blocked by dependency                           |
| [#20](https://github.com/rikkooo/jev-trade/issues/20) | Calibration, statistics, comparison, and report engine           | Kimi K3                              | #16, #19                    | Blocked by dependency                           |
| [#30](https://github.com/rikkooo/jev-trade/issues/30) | Independent prospective batch timestamp sink and verifier        | Opus 5.5                             | #15, #16                    | Blocks #26 and authoritative prospective claims |

The spine is complete when a frozen scenario can run all four arms, resolve under predeclared rules, and reproduce every deterministic result without calling Jev or a provider again.

The temporal invariant suite begins with contract and registry tests as soon as #15 and #16 land; API and job-race cases follow #17. Keep #18 as the accountable card until a split is justified by a reviewed implementation plan. No live Jev call starts before #31 closes. The timestamp sink in #30 is a separate prospective activation gate, not a prerequisite for fixture replay.

### Stage 2 — Activate the packs

Day and Swing form the first active learning loop. Scalping and Long-Term advance in parallel to the limit supported by rights and outcome maturity.

| Card                                                  | Outcome                                                           | Primary worker                       | Depends on                                    | State                            |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ | --------------------------------------------- | -------------------------------- |
| [#21](https://github.com/rikkooo/jev-trade/issues/21) | Swing Trading end to end                                          | Terra or Opus 5.5, assigned at start | #17, #19, #20; #14 for prospective activation | Blocked by dependency            |
| [#22](https://github.com/rikkooo/jev-trade/issues/22) | Day Trading with session boundaries and intraday momentum         | Terra                                | #14, #17, #19, #20                            | Blocked by dependency            |
| [#23](https://github.com/rikkooo/jev-trade/issues/23) | Scalping fixture and replay feasibility, then activation decision | Kimi K3                              | #14, #17-#20                                  | Blocked by dependency and rights |
| [#24](https://github.com/rikkooo/jev-trade/issues/24) | Point-in-time Long-Term cohort                                    | Terra + Gemini                       | #14, #17, #19, #20                            | Blocked by dependency            |

Pack software readiness and evidence readiness are different states. A pack may be implemented while live activation or efficacy remains held.

### Stage 3 — Teach and operate

| Card                                                  | Outcome                                                            | Primary worker | Depends on             | State                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------ | -------------- | ---------------------- | ------------------------------------------ |
| [#25](https://github.com/rikkooo/jev-trade/issues/25) | Tutor and evidence-chain experience                                | Terra          | #20-#22                | Blocked by dependency                      |
| [#26](https://github.com/rikkooo/jev-trade/issues/26) | Prospective cohort operations, attestation, budgets, and incidents | Sol + Terra    | #13, #18, #20-#22, #30 | Blocked by dependency and activation gates |

### Stage 4 — Decide

| Card                                                  | Outcome                                                              | Primary worker | Depends on        | State               |
| ----------------------------------------------------- | -------------------------------------------------------------------- | -------------- | ----------------- | ------------------- |
| [#27](https://github.com/rikkooo/jev-trade/issues/27) | Consolidated `GO`, `ADJUST`, `STOP`, or `NOT ENOUGH EVIDENCE` report | Sol + founder  | #13, #20, #23-#26 | Blocked by evidence |

Closing #27 updates this roadmap. A `GO` authorizes requirements work for the named next stage; it does not silently authorize brokerage or real-money execution.

## Parallel execution policy

- Sol (GPT-6) remains the orchestrator. Opus 5.5 runs directly through Claude Code on this box at `high` reasoning effort. A continuing advisory session is separate from execution and never signs DD.
- The orchestrator assigns one primary worker and one cold reviewer per card before implementation acceptance. A Claude-authored card receives a fresh non-Claude cold review, normally GPT-6 Astra or Grok. Opus 5.5 may cold-review non-Claude-authored cards in a separate fresh session. A second Claude seat is not an independent lineage for Claude-authored code.
- A DD receipt records the card, exact commit, served model, commands, findings, and disposition. The reviewer starts from the card, diff, repository, and authority docs, not an author's private handoff. The author does not close their own issue or approve their own change.
- Cards may run in parallel only when their listed dependencies are satisfied or their fixture-only scope is independent of the missing gate.
- GitHub's native blocked-by links mirror the hard dependencies in these tables. Conditional live-data gates remain explicit in the card text.
- Parallel branches do not reserve prerelease numbers. The next `0.2.0-alpha.N` is assigned after rebasing at final merge.
- A worker may research or prepare fixtures behind a data gate but may not weaken the gate or activate live behavior.
- The roadmap changes when evidence changes the plan. Superseded cards close with the deciding evidence linked rather than remaining ambiguous.

## Current execution gate

First merge #10 and land the #11, #12, and #14 reports with their limits intact. Opus 5.5 may salvage #15 on its isolated branch immediately, but #15 cannot merge until its full contract, migration, least-privilege, clean-checkout, and non-Claude DD gates pass. The existing `69a921e` commit is a draft, not accepted implementation. #13 remains open for founder and participant evidence. All packs remain fixture-only until rights, runtime, independent chronology, and outcome-maturity gates pass individually; neither an advertised vendor term nor a synthetic test authorizes live activation.

## Roadmap maintenance

After each merged card, the orchestrator updates:

1. the GitHub issue and milestone state;
2. the current build in `VERSION`, `package.json`, and `CHANGELOG.md`;
3. this roadmap if dependencies, sequencing, or release scope changed; and
4. `STATUS.md` with the active card, latest evidence, next gate, and blockers.
