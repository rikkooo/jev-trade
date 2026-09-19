# Jev Trade

Jev Trade is a transparent market-judgment simulator. It freezes Jev's typed view of a stock before the outcome is known, applies deterministic risk and paper-trading rules, and scores the result against simple baselines.

The product is a game and public experiment. It does not connect to a broker, accept deposits, execute orders, or provide personalized financial advice.

## What the prototype proves

- **Position mode:** a long-only, 20-session setup. Code decides `ENTER`, `HOLD`, `EXIT`, or `WAIT` from Jev's judgments and fixed risk gates.
- **Sprint mode:** an `UP`, `FLAT`, or `DOWN` forecast over 1 or 5 completed sessions. This is a scored direction contract, not a short sale.
- **Three separate risk concepts:** Jev's complete judgment distribution, a code-calculated market-risk index, and the paper position's maximum planned loss.
- **Frozen evidence:** every published decision records its cutoff, source hashes, exact model response, versions, policy action, and later outcome.
- **Prospective scoring:** calibration, Brier score, baselines, paper P&L, drawdown, turnover, and coverage are shown together. Hit rate never stands alone.

## Current implementation

The app runs on Node.js 22 with Next.js 16 and pnpm. Vercel is the public web runtime; the HQ box is the canonical build and validation environment. A portable Docker stack remains available for local validation and recovery.

The repository currently includes the application foundation, capability-gated configuration, health routes, security headers, structured secret redaction, Vercel and Docker deployment definitions, and the research/decision records that govern the implementation. Work follows the nine units in the [implementation plan](docs/plans/2026-09-19-1020-feature-jev-trade-prototype-plan.md).

Two deployment modes are deliberate:

| Mode | Purpose | Durable or prospective? |
| --- | --- | --- |
| `fixture` | Public product demonstration with committed synthetic data and frozen model fixtures | No. Writes fail closed; a visitor pick is browser-local. |
| `live` | Licensed market data, OpenRouter Jev evaluations, immutable Postgres ledger, cron jobs, and prospective scorecard | Yes, only after the documented data-rights, database, security, and review gates pass. |

Vercel plus Neon is the durable architecture. OpenRouter's dedicated Decisions API is the Jev transport. The Vercel AI Gateway credential is optional development infrastructure and is not used as a substitute for OpenRouter.

## Local setup

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. Fixture mode requires no provider credentials. `/api/health` reports safe capability flags and never returns secret values.

Run the core gates with:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose -f deploy/compose.yaml config
```

The full verification contract also includes integration, browser, forecast-reconstruction, audit, container, restore, and rollback gates as their implementation units land.

## Trust boundaries

Jev makes four narrow semantic judgments. Code owns prices, dates, market sessions, indicators, risk weights, thresholds, position sizing, fills, outcomes, and scores. A model distribution is never labeled as a probability of profit.

Real market data cannot appear publicly until a written provider record authorizes the exact fields, retention, derived outputs, display audience, screenshots/video, and onward processing sent to Jev. Fixture pages must identify themselves as synthetic and non-current.

Secrets belong in ignored local files or Vercel's sensitive environment store. Never place them in `NEXT_PUBLIC_*`, logs, screenshots, issues, commits, or provider payload fixtures.

## Documentation

- [Implementation plan](docs/plans/2026-09-19-1020-feature-jev-trade-prototype-plan.md)
- [Vercel-first decision](docs/decisions/0001-vercel-first-runtime.md)
- [Jev and OpenRouter contract](docs/research/jev-openrouter-integration.md)
- [Market-data provider decision](docs/research/market-data-provider-decision.md)
- [Trading product UI research](docs/research/trading-product-ui.md)
- [Vercel runtime architecture](docs/research/vercel-runtime-architecture.md)

## License

No open-source license has been granted. Public repository visibility does not grant permission to reuse its contents.
