# Changelog

All notable Jev Trade changes are recorded here. Versions follow [Semantic Versioning](https://semver.org/), including monotonic prerelease builds during an active milestone.

## Unreleased — #15, prerelease number assigned at merge

### Added

- Added the Phase Two Evidence Lab foundation: migration `0002_evidence_lab_registry` stores a content-addressed methodology registry, versioned cohorts bound to a registry root, point-in-time source revisions, evidence states with reassessment and correction links, operator audit events, and independent-timestamp receipt observations. All of it is append-only and written only through named role procedures ([#15](https://github.com/rikkooo/jev-trade/issues/15)).
- Defined shared typed contracts for all four pack profiles, their stance, action, and simulated-execution vocabularies, prediction provenance with every version boundary, four-arm equivalence, decision links, outcomes, and the run lifecycle.
- Added safe projection DTOs with a guard that fails closed on protected key names and on secret or protected values, plus a SQL denial suite, a TypeScript-to-PostgreSQL integration suite driven by per-role logins, and a v0.1-populated upgrade and rollback rehearsal.

### Changed

- Durable mode now requires distinct `OPERATOR_DATABASE_URL`, `WORKER_DATABASE_URL`, and `PUBLIC_DATABASE_URL` credentials and rejects the single `DATABASE_URL`. No runtime role may reuse the migration owner credential.
- The migration runner and verifier refuse a database that records an unknown migration. `pnpm db:migrate -- --through <version>` rehearses upgrades. The verifier recomputes every Phase Two seal and every typed column.

### Held

- Prospective cohort activation, prospective evidence states, live or licensed source origins, and receipt authority remain structurally closed until the readiness (#26), data-rights (#14), and timestamp-sink verification (#30) gates land.

## [0.2.0-alpha.1] - 2026-09-24

### Added

- Locked the Phase Two goal around independent prototype validation and an evidence-first predictor and experiment platform ([#10](https://github.com/rikkooo/jev-trade/issues/10), [#29](https://github.com/rikkooo/jev-trade/pull/29)).
- Defined the durable product vision, four trading packs, four comparison arms, evidence lifecycle, stage gates, and simulation boundary.
- Established roadmap, status, issue-card, changelog, and per-issue version controls for long-running execution.

### Changed

- Opened the v0.2.0 Evidence Lab prerelease line while the public product remains the stable v0.1.0 fixture prototype.
- Reaffirmed Sol's orchestration and added direct Claude Opus 5.5 execution with independent cross-lineage DD; corrected readiness labels and made the stranded contract branch, audit findings, and prospective timestamp-sink gate explicit ([#10](https://github.com/rikkooo/jev-trade/issues/10), [#30](https://github.com/rikkooo/jev-trade/issues/30)).

## [0.1.0] - 2026-09-19

### Added

- Released the public fixture prototype with blind picks, Position and Sprint modes, separated judgment and risk concepts, immutable audit evidence, deterministic policy and scoring, baseline comparisons, and a zero-sample prospective scorecard.
- Added reproducible forecast and deployment verification, database release controls, Vercel and Docker deployment paths, and the simulation and methodology disclosures.

[0.2.0-alpha.1]: https://github.com/rikkooo/jev-trade/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rikkooo/jev-trade/releases/tag/v0.1.0
