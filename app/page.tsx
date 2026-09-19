import {
  ArrowRight,
  CircleDollarSign,
  DatabaseZap,
  EyeOff,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { ForecastCard } from "@/components/forecast-card";
import { RiskTriptych } from "@/components/risk-triptych";
import { StatusBadge } from "@/components/status-badge";
import { SymbolSearch } from "@/components/symbol-search";
import {
  FIXTURE_FORECASTS,
  FIXTURE_PORTFOLIO,
  FIXTURE_SCORECARD,
  formatCurrency,
  formatPercent,
  getUniverse,
} from "@/modules/view-model";

export default function Home() {
  const universe = getUniverse();
  const lead = universe[0]!;
  const riskExample = FIXTURE_FORECASTS.find(
    (forecast) => forecast.symbol === "NOVA",
  )!;
  const current = universe.filter((stock) => stock.displayState === "current");
  const recentlyResolved = universe.filter((stock) =>
    ["resolved", "corrected", "void"].includes(stock.displayState),
  );

  return (
    <div className="page-wrap home-page">
      <section className="fixture-alert" aria-label="Demo data status">
        <FlaskConical aria-hidden="true" />
        <div>
          <strong>Synthetic fixture release</strong>
          <span>
            Every quote, chart, forecast, and paper result on this site is
            invented test data. Live market display is disabled.
          </span>
        </div>
        <Link href="/methodology#fixture-release">Read release limits</Link>
      </section>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">THE PUBLIC JUDGMENT LEDGER</p>
          <h1>See the call. Inspect the risk. Keep the record.</h1>
          <p className="hero-intro">
            Jev judges a frozen market state. Deterministic code applies the
            rules. The ledger preserves what happened next.
          </p>
          <SymbolSearch universe={universe} />
          <div className="hero-links">
            <Link
              className="button button-primary"
              href={`/stocks/${lead.symbol.toLowerCase()}`}
            >
              Enter the latest workspace <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="button button-secondary" href="/methodology">
              Inspect the method
            </Link>
          </div>
        </div>

        <article
          className="lead-terminal"
          aria-labelledby="lead-terminal-title"
        >
          <div className="terminal-topbar">
            <StatusBadge state={lead.displayState} />
            <span>SYNTHETIC · UNREVEALED</span>
          </div>
          <div className="terminal-symbol">
            <div>
              <p className="eyebrow">LATEST FIXTURE JUDGMENT</p>
              <h2 id="lead-terminal-title">
                {lead.symbol}{" "}
                <span>
                  {lead.mode} · {lead.horizonSessions}S
                </span>
              </h2>
              <p>{lead.company}</p>
            </div>
            <div className="terminal-quote">
              <strong>{formatCurrency(lead.price)}</strong>
              <span className="positive">
                {formatPercent(lead.sessionChangePercent)}
              </span>
            </div>
          </div>
          <div className="blind-summary blind-summary-large">
            <EyeOff aria-hidden="true" />
            <div>
              <strong>Blind pick open</strong>
              <p>
                Jev judgment, policy action, and risk output are absent from
                this ACME card. Pick or skip in its workspace to reveal them.
              </p>
            </div>
          </div>
          <p className="terminal-note">
            Browser-local demo · one frozen pick per fixture forecast · no
            account required.
          </p>
          <Link
            className="terminal-link"
            href={`/stocks/${lead.symbol.toLowerCase()}`}
          >
            Make a blind pick, then reveal <ArrowRight aria-hidden="true" />
          </Link>
        </article>
      </section>

      <section className="signal-strip" aria-label="Experiment status">
        <article>
          <DatabaseZap aria-hidden="true" />
          <div>
            <span>Data mode</span>
            <strong>Synthetic fixture</strong>
            <small>No live provider connected</small>
          </div>
        </article>
        <article>
          <ShieldCheck aria-hidden="true" />
          <div>
            <span>Ledger mode</span>
            <strong>Read-only demo</strong>
            <small>Durable writes disabled</small>
          </div>
        </article>
        <article>
          <CircleDollarSign aria-hidden="true" />
          <div>
            <span>Prospective sample</span>
            <strong>{FIXTURE_SCORECARD.prospectiveSampleSize} forecasts</strong>
            <small>Public clock has not started</small>
          </div>
        </article>
      </section>

      <RiskTriptych forecast={riskExample} />

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT FIXTURE DESK</p>
            <h2>Latest frozen decisions</h2>
          </div>
          <Link className="text-link" href="/explore">
            Explore all fixture states
          </Link>
        </div>
        <div className="forecast-grid">
          {current.map((stock) => (
            <ForecastCard stock={stock} key={stock.forecastId} />
          ))}
        </div>
      </section>

      <section className="portfolio-preview split-panel">
        <div>
          <p className="eyebrow">HOUSE PAPER PORTFOLIO · SYNTHETIC</p>
          <h2>Rules applied in public</h2>
          <p>
            The shared fixture account starts with{" "}
            {formatCurrency(FIXTURE_PORTFOLIO.startingEquity)}. It uses capped
            loss, capped notional, next-open paper fills, and no brokerage
            connection.
          </p>
          <Link className="button button-secondary" href="/portfolio">
            Open paper portfolio
          </Link>
        </div>
        <dl className="portfolio-kpis">
          <div>
            <dt>Fixture equity</dt>
            <dd>{formatCurrency(FIXTURE_PORTFOLIO.equity)}</dd>
          </div>
          <div>
            <dt>Cash</dt>
            <dd>{formatCurrency(FIXTURE_PORTFOLIO.cash)}</dd>
          </div>
          <div>
            <dt>Open exposure</dt>
            <dd>{formatCurrency(FIXTURE_PORTFOLIO.exposure)}</dd>
          </div>
          <div>
            <dt>Max planned loss</dt>
            <dd>{formatCurrency(FIXTURE_PORTFOLIO.plannedLoss)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">APPEND-ONLY EXAMPLES</p>
            <h2>Resolved, corrected, and void</h2>
          </div>
          <Link className="text-link" href="/scorecard">
            View scorecard readiness
          </Link>
        </div>
        <div className="forecast-grid forecast-grid-three">
          {recentlyResolved.map((stock) => (
            <ForecastCard stock={stock} key={stock.forecastId} />
          ))}
        </div>
      </section>
    </div>
  );
}
