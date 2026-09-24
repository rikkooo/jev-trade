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

The program contract merged through [PR #29](https://github.com/rikkooo/jev-trade/pull/29) as `0.2.0-alpha.1`. Audit artifacts proceed through separate cards; a committed report is not independently accepted until its review and release gates pass.

| Card                                                  | Outcome                                                                | Primary worker   | Depends on | State                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- | ---------- | ------------------------------------------------------- |
| [#10](https://github.com/rikkooo/jev-trade/issues/10) | Lock goal, requirements, roadmap, status, issues, and release controls | Sol              | None       | Merged PR #29; Grok 4.6 DD PASS                         |
| [#11](https://github.com/rikkooo/jev-trade/issues/11) | Cold v0.1.0 code, release, security, and reproducibility audit         | Opus5            | #10        | Audit and 50-row index in PR #35; DD tracked there      |
| [#12](https://github.com/rikkooo/jev-trade/issues/12) | Cold responsive UI/UX, accessibility, and comprehension audit          | Grok 4.6         | #10        | Report committed in worktree; land and DD               |
| [#14](https://github.com/rikkooo/jev-trade/issues/14) | Provider rights, point-in-time semantics, and pack readiness matrix    | Gemini 3.8 Flash | #10        | Candidate `1af1350` rejected; fixes and new DD required |
| [#13](https://github.com/rikkooo/jev-trade/issues/13) | Reconcile cold audits and founder testing                              | Sol + founder    | #11, #12   | Skeleton only; human results pending                    |

The independent validators do not fix the code they judge. Accepted fixes receive separate cards and cold reverification.

The first audit identified separate remediation cards: [#31](https://github.com/rikkooo/jev-trade/issues/31) for locale-independent Jev hashing, [#32](https://github.com/rikkooo/jev-trade/issues/32) for the forecast release gate, and [#33](https://github.com/rikkooo/jev-trade/issues/33) for the missing v0.1.0 release receipt. The UI audit's eight major findings are grouped in [#34](https://github.com/rikkooo/jev-trade/issues/34). Their acceptance evidence feeds #13; no retrospective receipt may be represented as contemporaneous.

GitHub's native dependency graph now records #31–#33 blocked by #11, #34 blocked by #12, #17 blocked by #31, #30 blocked by #15 and #16, and #26 blocked by #30. Initial #13 triage may guide #34 fixes without making #34 depend on #13 closure and creating a cycle.

### Stage 1 — Establish the experiment spine

| Card                                                  | Outcome                                                          | Primary worker                   | Depends on                  | State                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- | --------------------------- | ------------------------------------------------------- |
| [#15](https://github.com/rikkooo/jev-trade/issues/15) | Versioned pack contracts and immutable evidence records          | Opus 5.5 on Terra/Opus draft     | #10; #14 for live semantics | Stranded mixed-lineage partial; salvage and rerun gates |
| [#16](https://github.com/rikkooo/jev-trade/issues/16) | Preregistered cohorts and four equivalent comparison arms        | Opus 5.5                         | #15                         | Blocked by dependency                                   |
| [#17](https://github.com/rikkooo/jev-trade/issues/17) | Idempotent predictor jobs and versioned research API             | Opus 5.5                         | #15, #16, #31               | Blocked by dependency                                   |
| [#18](https://github.com/rikkooo/jev-trade/issues/18) | Temporal leakage and adversarial invariant suite                 | Kimi K3 candidate; identity gate | #15-#17                     | Blocked by dependency and model verification            |
| [#19](https://github.com/rikkooo/jev-trade/issues/19) | Pack-aware policy, execution, reassessment, and outcome resolver | Terra; capacity gate             | #17, #18                    | Blocked by dependency and worker capacity               |
| [#20](https://github.com/rikkooo/jev-trade/issues/20) | Calibration, statistics, comparison, and report engine           | Kimi K3 candidate; identity gate | #16, #19                    | Blocked by dependency and model verification            |
| [#30](https://github.com/rikkooo/jev-trade/issues/30) | Independent prospective batch timestamp sink and verifier        | Opus 5.5                         | #15, #16                    | Blocks #26 and authoritative prospective claims         |

The spine is complete when a frozen scenario can run all four arms, resolve under predeclared rules, and reproduce every deterministic result without calling Jev or a provider again.

The temporal invariant suite begins with contract and registry tests as soon as #15 and #16 land; API and job-race cases follow #17. Keep #18 as the accountable card until a split is justified by a reviewed implementation plan. No live Jev call starts before #31 closes. The timestamp sink in #30 is a separate prospective activation gate, not a prerequisite for fixture replay.

### Stage 2 — Activate the packs

Day and Swing form the first active learning loop. Scalping and Long-Term advance in parallel to the limit supported by rights and outcome maturity.

| Card                                                  | Outcome                                                           | Primary worker                   | Depends on                                    | State                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------- | --------------------------------------------- | ----------------------------------------- |
| [#21](https://github.com/rikkooo/jev-trade/issues/21) | Swing Trading end to end                                          | Terra; capacity gate             | #17, #19, #20; #14 for prospective activation | Blocked by dependency and worker capacity |
| [#22](https://github.com/rikkooo/jev-trade/issues/22) | Day Trading with session boundaries and intraday momentum         | Terra                            | #14, #17, #19, #20                            | Blocked by dependency                     |
| [#23](https://github.com/rikkooo/jev-trade/issues/23) | Scalping fixture and replay feasibility, then activation decision | Kimi K3 candidate; identity gate | #14, #17-#20                                  | Blocked by dependency and rights          |
| [#24](https://github.com/rikkooo/jev-trade/issues/24) | Point-in-time Long-Term cohort                                    | Terra + Gemini                   | #14, #17, #19, #20                            | Blocked by dependency                     |

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
- Sol assigns the primary worker and cold reviewer when a card starts, before its implementation diff exists. Every contributor lineage counts; mixed Terra/Opus #15 requires Grok DD. Opus 5.5 may cold-review non-Claude-authored cards in a separate clean session, except a card that tests or attests Opus-authored substrate. A second Claude seat is not an independent lineage for Claude-authored code.
- A DD receipt records the card, exact commit, served model, commands, findings, and disposition. The reviewer starts from the card, diff, repository, and authority docs, not an author's private handoff. The author does not close their own issue or approve their own change.
- Cards may run in parallel only when their listed dependencies are satisfied or their fixture-only scope is independent of the missing gate.
- GitHub issue text and this roadmap must agree on hard dependencies. Conditional live-data gates remain explicit in the card text. Early invariant fixtures in #18 may start after #15-#16, while closing the full card requires #17.
- Parallel branches do not reserve prerelease numbers. The next `0.2.0-alpha.N` is assigned after rebasing at final merge.
- A worker may research or prepare fixtures behind a data gate but may not weaken the gate or activate live behavior.
- The roadmap changes when evidence changes the plan. Superseded cards close with the deciding evidence linked rather than remaining ambiguous.

## Review assignments

These assignments apply to the named card, not an entire downstream system. Sol checks the actual commit authors and served models before each review; a changed or mixed author lineage requires reassignment before acceptance. Terra and K3 work remains held until their capacity and served identity are verified. An author never launches their own DD.

| Card     | Author or candidate       | Cold DD                                        | Extra decision gate                                                 |
| -------- | ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| #10      | Sol                       | Grok 4.6                                       | Green CI and merge                                                  |
| #11      | Opus5                     | Grok 4.6 for audit provenance and completeness | Archive raw logs; fix cards remain open                             |
| #12      | Grok 4.6                  | Opus 5.5                                       | Founder/participant comprehension remains pending                   |
| #13      | Sol + founder             | Opus 5.5 and Grok 4.6 for source fidelity      | Founder signs material risk/invalid dispositions                    |
| #14      | Opus5 + Gemini + Sol      | Grok 4.6 for full-branch source trace          | Earlier Opus co-authorship rules out Opus DD; rights remain held    |
| #15      | Terra + Opus 5.5          | Grok 4.6                                       | Full migration/security gates on final SHA                          |
| #16      | Opus 5.5                  | GPT-6 Astra                                    | Reassign if the diff includes Terra-authored code                   |
| #17      | Opus 5.5                  | GPT-6 Astra                                    | #31 before any real Jev call; reassign on mixed authorship          |
| #18      | Kimi K3 candidate         | GPT-6 Astra or Grok 4.6 after identity check   | DD must be independent of Opus-authored substrate                   |
| #19      | Terra candidate           | Grok 4.6                                       | Capacity check before start                                         |
| #20      | Kimi K3 candidate         | GPT-6 Astra or Grok 4.6 after identity check   | Independent statistical and substrate review                        |
| #21, #22 | Terra candidate           | Grok 4.6                                       | Per-pack rights and runtime receipts                                |
| #23      | Kimi K3 candidate         | GPT-6 Astra or Grok 4.6 after identity check   | Scalping readiness receipt                                          |
| #24      | Terra + Gemini candidates | Grok 4.6                                       | Long-horizon outcome maturity                                       |
| #25      | Terra candidate           | Grok 4.6                                       | Uncoached comprehension gate remains separate                       |
| #26      | Sol + Terra candidates    | Grok 4.6                                       | #30, rights, runtime, and chronology receipts                       |
| #27      | Sol + founder             | Grok 4.6                                       | Founder signs each stage decision                                   |
| #30      | Opus 5.5                  | Grok 4.6                                       | Independently replay sink proof                                     |
| #31      | Non-Claude implementer    | Grok 4.6                                       | Cross-locale golden hashes; original Opus auditor recused           |
| #32      | Non-Claude implementer    | Grok 4.6                                       | Clean checkout and failing-case CI receipt; Opus auditor recused    |
| #33      | Sol + release operator    | Grok 4.6                                       | Founder signs any retrospective accepted risk; Opus auditor recused |
| #34      | Opus 5.5                  | Grok 4.6                                       | Browser state matrix and #13 dispositions                           |

## Current execution gate

#10 passed Grok DD and merged. Accept #11 and #12 only through their reviewed PRs, with their limits intact. The #14 candidate has eight major Opus advisory findings, including fail-open schema cases and unsupported rights claims; it requires corrections and full-branch Grok DD before landing. Opus 5.5 is salvaging #15 on its isolated branch, but #15 cannot merge until its full contract, migration, least-privilege, clean-checkout, and Grok DD gates pass. The existing `69a921e` commit is a draft, not accepted implementation. #13 remains open for founder and participant evidence. All packs remain fixture-only until rights, runtime, independent chronology, and outcome-maturity gates pass individually; neither an advertised vendor term nor a synthetic test authorizes live activation.

## Roadmap maintenance

After each merged card, the orchestrator updates:

1. the GitHub issue and milestone state;
2. the current build in `VERSION`, `package.json`, and `CHANGELOG.md`;
3. this roadmap if dependencies, sequencing, or release scope changed; and
4. `STATUS.md` with the active card, latest evidence, next gate, and blockers.
