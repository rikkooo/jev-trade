# Active goal: Jev Trade Phase Two

- **Locked:** 2026-09-20; execution mandate reaffirmed 2026-09-24
- **Target release:** v0.2.0 — Evidence Lab
- **Program owner:** Jev Trade orchestrator
- **Authority:** The product vision and business rules agreed with the founder

## Objective

Deliver Jev Trade Phase Two as an evidence-first market-judgment laboratory and trading tutor through two coordinated tracks.

First, freeze the released v0.1.0 prototype and commission an independent-lineage validation of its code, release evidence, responsive UI/UX, accessibility, security, and fidelity to the canonical product requirements. Reconcile those findings with the founder's human validation.

Second, design and implement a simulation-only, versioned predictor and experiment API for scalping, day trading, swing trading, and long-term investing. Every forecast must use licensed point-in-time inputs, deterministic standard indicators and baselines, a typed Jev judgment, explicit risk and execution policy, an immutable linked decision lifecycle, forward outcome resolution, and reproducible evidence reports.

Scalping, Day Trading, and Swing Trading may simulate long, short, or wait decisions under deterministic locate, borrow, cost, fill, and risk controls. Long-Term Investing remains a long-only accumulation, maintenance, reduction, exit, or wait simulation. Only research operators may schedule automated cohort reassessments in Phase Two; learner-triggered paper automation remains behind the evidence gate.

Jev Trade will compare four arms on equivalent information:

1. standard tools and deterministic strategy rules;
2. Jev judging the same frozen inputs;
3. the complete Jev Trade policy, including risk and execution controls; and
4. naive controls appropriate to the pack and horizon.

The primary incremental-Jev policy comparison must hold deterministic risk, policy, execution, and cost versions constant between the standard-tools and Full Jev Trade arms so their difference is attributable to the forecast source. Any comparison that changes the downstream policy is reported separately as a product-bundle comparison.

The evidence must show where judgment helps, where it does not, how well confidence is calibrated, and how results change after costs, latency, risk controls, market regimes, and model or policy versions. Credibility evidence is more valuable than a spectacular but fragile accuracy claim.

## Execution mandate

Sol (GPT-6) remains the single program orchestrator: maintain the goal, issue order, acceptance evidence, independent review assignments, release versions, and truthful status. Claude Opus 5.5 joins as a direct-on-box executor and as a cold due-diligence reviewer of work authored outside the Claude lineage. Use `high` reasoning effort for its advisory and execution sessions. Keep the ongoing Opus advisory session separate from card execution and from cold DD.

Every card must name its author and a reviewer from a different model lineage before implementation is accepted. A Claude-authored change cannot be validated by another Claude session or seat. A cold reviewer starts from the card, pinned diff, repository, and authority documents, records the served model and exact revision, reruns relevant gates, and leaves a durable review receipt. The orchestrator resolves findings and serializes merges and version numbers. The founder retains product-boundary and final stage decisions.

This is an execution pivot, not a change to the simulation boundary, evidence standard, four-pack contract, or completion criteria below. The dated [Opus roadmap review](docs/reviews/2026-09-24-opus-roadmap-review.md) informs the revised sequence; its judgments are reconciled in `ROADMAP.md` and current facts live in `STATUS.md`.

## Execution order

1. Validate the frozen v0.1.0 prototype independently and reconcile the findings.
2. Establish the shared prediction, experiment, outcome, and evidence contracts for all four packs.
3. Activate Day Trading and Swing Trading first because their data and outcome cycles give the fastest credible learning loop.
4. Activate Scalping after tick or Level 2 data rights, latency modeling, spread, fees, slippage, and adverse-selection controls are ready.
5. Start the Long-Term cohort once point-in-time filings and corporate-action handling are ready; treat its evidence as intentionally slow-maturing.
6. Accumulate prospective evidence and issue a consolidated `GO`, `ADJUST`, `STOP`, or `NOT ENOUGH EVIDENCE` decision before expanding into a public predictor, advisory behavior, or automation.

## Non-negotiable controls

- Point-in-time correctness: no forecast may see data published after its cutoff.
- Immutable provenance: inputs, source timestamps, hashes, model outputs, code and policy versions, actions, reviews, and outcomes remain linked and auditable.
- Externally anchored chronology: an authoritative prospective batch must carry an independent timestamp receipt created before the earliest evaluated outcome; missing or late receipts reduce verified coverage and cannot support a prospective claim.
- Bounded judgment: Jev returns narrow typed judgments; code owns arithmetic, dates, indicators, thresholds, sizing, fills, fees, stops, and scoring.
- Honest evaluation: historical replay is exploratory; prospective evidence is authoritative.
- Equivalent comparisons: all arms receive the same eligible information at the same cutoff.
- Full reporting: calibration, Brier and log loss, coverage, net simulated results, drawdown, reliability, latency, and regime slices accompany directional accuracy.
- Cost robustness: applicable policy results must show preregistered base and adverse execution-cost scenarios; a conclusion that reverses under the adverse case cannot receive an unqualified policy-performance `GO`.
- Simulation boundary: no brokerage connection, deposits, real order execution, personalized allocation, or unsupported performance claim belongs in Phase Two.
- Controlled automation: scheduled reassessment is limited to operator-run research cohorts; the learner experience exposes decisions and evidence without start, pause, or stop controls for an autonomous policy.
- Licensed inputs: live or publicly displayed data remains gated by recorded provider rights.

## Completion contract

Phase Two is complete only when:

- the independent code and UI/UX review and human validation are reconciled into one signed-off report;
- the four-pack contract is implemented, with Day and Swing complete on fixtures or licensed replay and ready to activate preregistered prospective cohorts, while any unavailable live mode is held by an explicit data-readiness gate;
- Scalping and Long-Term are operational, held by an evidence-backed readiness gate, or recorded as `NOT ENOUGH EVIDENCE`; unresolved long-horizon outcomes do not block the software release;
- scenario runs, decision revisions, outcome resolution, baselines, and reports are reproducible from immutable records;
- the four comparison arms can be evaluated without look-ahead leakage;
- prospective evidence is accumulating under a published methodology;
- every completed issue advances the build version and is recorded in the changelog;
- the roadmap, current status, requirements, issues, and release state agree; and
- a consolidated evidence review records **GO**, **ADJUST**, **STOP**, or **NOT ENOUGH EVIDENCE** for each pack and proposed next product stage.

## Authority order

When program surfaces disagree, resolve them in this order:

1. explicit founder decisions recorded in this file;
2. `VISION.md` for durable product direction, when it does not narrow this active goal;
3. the Phase Two Product Contract for requirements and acceptance behavior;
4. the v0.1.0 plan for shipped prototype behavior only;
5. `ROADMAP.md` and GitHub issues for execution order, ownership, and dependencies;
6. `STATUS.md` for the present state; and
7. `docs/governance/versioning.md` for version numbers and release mechanics.

Lower-ranked execution artifacts may refine implementation detail. They may not weaken a higher-ranked product boundary or evidence gate.

## Change control

This file is the active program contract. Routine implementation choices may refine the requirements and roadmap without changing this objective. Any change to the product identity, simulation boundary, evidence standard, comparison design, or completion contract requires an explicit founder decision and a recorded changelog entry.
