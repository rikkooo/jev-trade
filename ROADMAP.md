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

These cards form the first parallel execution tranche after the program contract.

| Card                                                  | Outcome                                                                | Primary worker   | Depends on | State               |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- | ---------- | ------------------- |
| [#10](https://github.com/rikkooo/jev-trade/issues/10) | Lock goal, requirements, roadmap, status, issues, and release controls | Sol              | None       | Complete in alpha.1 |
| [#11](https://github.com/rikkooo/jev-trade/issues/11) | Cold v0.1.0 code, release, security, and reproducibility audit         | Opus5            | #10        | Ready               |
| [#12](https://github.com/rikkooo/jev-trade/issues/12) | Cold responsive UI/UX, accessibility, and comprehension audit          | Grok 4.6         | #10        | Ready               |
| [#14](https://github.com/rikkooo/jev-trade/issues/14) | Provider rights, point-in-time semantics, and pack readiness matrix    | Gemini 3.8 Flash | #10        | Ready               |
| [#13](https://github.com/rikkooo/jev-trade/issues/13) | Reconcile cold audits and founder testing                              | Sol + founder    | #11, #12   | Blocked by evidence |

The independent validators do not fix the code they judge. Accepted fixes receive separate cards and cold reverification.

### Stage 1 — Establish the experiment spine

| Card                                                  | Outcome                                                          | Primary worker | Depends on                  | State                  |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------------- | --------------------------- | ---------------------- |
| [#15](https://github.com/rikkooo/jev-trade/issues/15) | Versioned pack contracts and immutable evidence records          | Terra          | #10; #14 for live semantics | Ready for fixture work |
| [#16](https://github.com/rikkooo/jev-trade/issues/16) | Preregistered cohorts and four equivalent comparison arms        | Terra          | #15                         | Blocked by dependency  |
| [#17](https://github.com/rikkooo/jev-trade/issues/17) | Idempotent predictor jobs and versioned research API             | Terra          | #15, #16                    | Blocked by dependency  |
| [#18](https://github.com/rikkooo/jev-trade/issues/18) | Temporal leakage and adversarial invariant suite                 | Kimi K3        | #15-#17                     | Blocked by dependency  |
| [#19](https://github.com/rikkooo/jev-trade/issues/19) | Pack-aware policy, execution, reassessment, and outcome resolver | Terra          | #17, #18                    | Blocked by dependency  |
| [#20](https://github.com/rikkooo/jev-trade/issues/20) | Calibration, statistics, comparison, and report engine           | Kimi K3        | #16, #19                    | Blocked by dependency  |

The spine is complete when a frozen scenario can run all four arms, resolve under predeclared rules, and reproduce every deterministic result without calling Jev or a provider again.

### Stage 2 — Activate the packs

Day and Swing form the first active learning loop. Scalping and Long-Term advance in parallel to the limit supported by rights and outcome maturity.

| Card                                                  | Outcome                                                           | Primary worker | Depends on         | State                            |
| ----------------------------------------------------- | ----------------------------------------------------------------- | -------------- | ------------------ | -------------------------------- |
| [#21](https://github.com/rikkooo/jev-trade/issues/21) | Swing Trading end to end                                          | Terra          | #17, #19, #20      | Blocked by dependency            |
| [#22](https://github.com/rikkooo/jev-trade/issues/22) | Day Trading with session boundaries and intraday momentum         | Terra          | #14, #17, #19, #20 | Blocked by dependency            |
| [#23](https://github.com/rikkooo/jev-trade/issues/23) | Scalping fixture and replay feasibility, then activation decision | Kimi K3        | #14, #17-#20       | Blocked by dependency and rights |
| [#24](https://github.com/rikkooo/jev-trade/issues/24) | Point-in-time Long-Term cohort                                    | Terra + Gemini | #14, #17, #19, #20 | Blocked by dependency            |

Pack software readiness and evidence readiness are different states. A pack may be implemented while live activation or efficacy remains held.

### Stage 3 — Teach and operate

| Card                                                  | Outcome                                                            | Primary worker | Depends on        | State                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------ | -------------- | ----------------- | ------------------------------------------ |
| [#25](https://github.com/rikkooo/jev-trade/issues/25) | Tutor and evidence-chain experience                                | Terra          | #20-#22           | Blocked by dependency                      |
| [#26](https://github.com/rikkooo/jev-trade/issues/26) | Prospective cohort operations, attestation, budgets, and incidents | Sol + Terra    | #13, #18, #20-#22 | Blocked by dependency and activation gates |

### Stage 4 — Decide

| Card                                                  | Outcome                                                              | Primary worker | Depends on        | State               |
| ----------------------------------------------------- | -------------------------------------------------------------------- | -------------- | ----------------- | ------------------- |
| [#27](https://github.com/rikkooo/jev-trade/issues/27) | Consolidated `GO`, `ADJUST`, `STOP`, or `NOT ENOUGH EVIDENCE` report | Sol + founder  | #13, #20, #23-#26 | Blocked by evidence |

Closing #27 updates this roadmap. A `GO` authorizes requirements work for the named next stage; it does not silently authorize brokerage or real-money execution.

## Parallel execution policy

- The orchestrator assigns one primary worker and one cold reviewer per card.
- Cards may run in parallel only when their listed dependencies are satisfied or their fixture-only scope is independent of the missing gate.
- GitHub's native blocked-by links mirror the hard dependencies in these tables. Conditional live-data gates remain explicit in the card text.
- Parallel branches do not reserve prerelease numbers. The next `0.2.0-alpha.N` is assigned after rebasing at final merge.
- A worker may research or prepare fixtures behind a data gate but may not weaken the gate or activate live behavior.
- The roadmap changes when evidence changes the plan. Superseded cards close with the deciding evidence linked rather than remaining ambiguous.

## Roadmap maintenance

After each merged card, the orchestrator updates:

1. the GitHub issue and milestone state;
2. the current build in `VERSION`, `package.json`, and `CHANGELOG.md`;
3. this roadmap if dependencies, sequencing, or release scope changed; and
4. `STATUS.md` with the active card, latest evidence, next gate, and blockers.
