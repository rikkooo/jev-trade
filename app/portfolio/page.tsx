import {
  ArrowRight,
  BriefcaseBusiness,
  Info,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  FIXTURE_PORTFOLIO,
  formatCurrency,
  formatPercent,
  formatUtc,
} from "@/modules/view-model";

export const metadata: Metadata = { title: "Synthetic paper portfolio" };

function EquityCurve() {
  const points = FIXTURE_PORTFOLIO.equityCurve;
  const min = Math.min(...points.map((point) => point.equity));
  const max = Math.max(...points.map((point) => point.equity));
  const spread = max - min || 1;
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${24 + index * (652 / (points.length - 1))},${220 - ((point.equity - min) / spread) * 180}`,
    )
    .join(" ");
  return (
    <div className="equity-chart">
      <svg
        viewBox="0 0 700 250"
        role="img"
        aria-labelledby="equity-title equity-desc"
        preserveAspectRatio="none"
      >
        <title id="equity-title">Synthetic paper equity curve</title>
        <desc id="equity-desc">
          Fixture equity moved from 100,000 dollars to 100,684 dollars across
          six marked sessions.
        </desc>
        <g className="chart-grid">
          <line x1="24" x2="676" y1="40" y2="40" />
          <line x1="24" x2="676" y1="130" y2="130" />
          <line x1="24" x2="676" y1="220" y2="220" />
        </g>
        <path d={line} className="price-line" />
      </svg>
    </div>
  );
}

export default function PortfolioPage() {
  const totalReturn =
    (FIXTURE_PORTFOLIO.equity / FIXTURE_PORTFOLIO.startingEquity - 1) * 100;
  return (
    <div className="page-wrap portfolio-page">
      <header className="page-header with-badge">
        <div>
          <p className="eyebrow">ONE SHARED HOUSE EXPERIMENT</p>
          <h1>Synthetic paper portfolio</h1>
          <p>
            A deterministic projection of fixture deposits, fills, marks, exits,
            and corrections. No brokerage or real capital is connected.
          </p>
        </div>
        <span className="simulation-stamp">SIMULATED · FIXTURE DATA</span>
      </header>

      <section
        className="portfolio-summary"
        aria-label="Paper portfolio summary"
      >
        <article className="primary-kpi">
          <span>Fixture equity</span>
          <strong>{formatCurrency(FIXTURE_PORTFOLIO.equity)}</strong>
          <small className="positive">
            {formatPercent(totalReturn, 2)} since synthetic inception
          </small>
        </article>
        <article>
          <WalletCards aria-hidden="true" />
          <span>Cash</span>
          <strong>{formatCurrency(FIXTURE_PORTFOLIO.cash)}</strong>
        </article>
        <article>
          <BriefcaseBusiness aria-hidden="true" />
          <span>Open exposure</span>
          <strong>{formatCurrency(FIXTURE_PORTFOLIO.exposure)}</strong>
        </article>
        <article>
          <ShieldCheck aria-hidden="true" />
          <span>Maximum planned loss</span>
          <strong>{formatCurrency(FIXTURE_PORTFOLIO.plannedLoss)}</strong>
        </article>
      </section>

      <section className="panel equity-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIXTURE EQUITY CURVE</p>
            <h2>Portfolio value by completed session</h2>
          </div>
          <span className="mono-tag">paper-portfolio-v1</span>
        </div>
        <EquityCurve />
        <details className="data-table-disclosure">
          <summary>View accessible equity data</summary>
          <div className="table-scroll">
            <table>
              <caption>Synthetic paper equity by session</caption>
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Equity</th>
                </tr>
              </thead>
              <tbody>
                {FIXTURE_PORTFOLIO.equityCurve.map((point) => (
                  <tr key={point.session}>
                    <th scope="row">{point.session}</th>
                    <td>{formatCurrency(point.equity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OPEN PAPER POSITIONS</p>
            <h2>Deterministic risk in dollars</h2>
          </div>
          <Link className="text-link" href="/methodology#position-risk">
            Sizing rules
          </Link>
        </div>
        <div className="table-scroll">
          <table className="position-table">
            <caption>Open synthetic paper positions</caption>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Shares</th>
                <th scope="col">Entry</th>
                <th scope="col">Mark</th>
                <th scope="col">Stop</th>
                <th scope="col">Paper P&amp;L</th>
                <th scope="col">Record</th>
              </tr>
            </thead>
            <tbody>
              {FIXTURE_PORTFOLIO.openPositions.map((position) => (
                <tr key={position.forecastId}>
                  <th scope="row">
                    <Link href={`/stocks/${position.symbol.toLowerCase()}`}>
                      {position.symbol}
                    </Link>
                  </th>
                  <td>{position.shares}</td>
                  <td>{formatCurrency(position.entry)}</td>
                  <td>{formatCurrency(position.mark)}</td>
                  <td>{formatCurrency(position.stop)}</td>
                  <td
                    className={position.paperPnl >= 0 ? "positive" : "negative"}
                  >
                    {formatCurrency(position.paperPnl)}
                  </td>
                  <td>
                    <Link
                      className="icon-link"
                      href={`/forecasts/${position.forecastId}`}
                      aria-label={`Audit ${position.symbol} forecast`}
                    >
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="inline-disclosure">
          <Info aria-hidden="true" /> Marks and fills are synthetic. A displayed
          paper value is not an executable market value.
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">APPEND-ONLY EVENT LEDGER</p>
            <h2>How the projection was built</h2>
          </div>
          <span>{FIXTURE_PORTFOLIO.events.length} fixture events</span>
        </div>
        <div className="table-scroll">
          <table>
            <caption>Synthetic paper portfolio events</caption>
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Type</th>
                <th scope="col">Symbol</th>
                <th scope="col">Detail</th>
                <th scope="col">Cash delta</th>
              </tr>
            </thead>
            <tbody>
              {FIXTURE_PORTFOLIO.events.map((event) => (
                <tr key={event.id}>
                  <td>{formatUtc(event.at)}</td>
                  <td>
                    <span className="mono-tag">{event.type}</span>
                  </td>
                  <th scope="row">{event.symbol}</th>
                  <td>{event.detail}</td>
                  <td>
                    {event.cashDelta === 0
                      ? "—"
                      : formatCurrency(event.cashDelta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
