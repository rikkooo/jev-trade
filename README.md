# Jev Trade

Jev Trade is a market-data trading simulator built to test Jev's judgment capabilities in public. It records every model judgment before the outcome is known, applies deterministic risk and trading rules, and scores the results against simple baselines.

The prototype is a game using real market data. It does not connect to a broker, accept deposits, execute orders, or provide personalized investment advice.

## Product shape

- **Position mode:** Jev evaluates a long-only, 20-session setup. A deterministic policy decides whether the house paper portfolio enters, holds, exits, or waits.
- **Sprint mode:** Jev forecasts up, flat, or down over 1 or 5 sessions. This is a scored direction game, not a synthetic short position.
- **Three separate risk displays:** Jev's judgment distribution, a code-calculated market-risk index, and the paper position's maximum planned loss. Jev confidence is never presented as a probability of profit.
- **Public decision ledger:** Every forecast is timestamped with its input hash, data cutoff, model version, question-set version, policy version, and later outcome.
- **Live scorecard:** Calibration, Brier score, benchmark comparisons, paper P&L, and drawdown are visible alongside hit rate.

## Current phase

The repository is intentionally documentation-first. The implementation-ready plan is the source of truth:

- [Jev Trade prototype plan](docs/plans/2026-09-19-1020-feature-jev-trade-prototype-plan.md)

The first deployment target is a western Linux host using Docker Compose and Caddy. The Next.js web code remains Vercel-compatible if speed or host availability makes that useful; its worker and database would then need managed replacements. Domain configuration is managed separately by the project owner.

## Evidence standard

Jev's usefulness for market-direction judgment has not been established. The prototype exists to measure it prospectively. Retrospective runs made by a current model are exploratory only because the model may already know historical events.

The two finance projects listed by `awesome-jev` were reviewed as prior art. Neither currently carries a reusable license, so this repository does not copy their code, interface, media, or naming. See the plan's research appendix for the full assessment.

## Data and launch gate

Development can run with fixtures or a provider key permitted for internal use. Public display and promotion remain gated on written market-data rights covering the exact fields, storage, derived values, and audience used by the app. The provider adapter keeps that commercial choice outside the product core.

## Repository status

No open-source license has been granted yet. Public visibility does not grant permission to reuse the repository's contents.
