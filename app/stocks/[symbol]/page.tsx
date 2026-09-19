import { AlertTriangle, Clock3, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlindDecisionBoundary } from "@/components/blind-decision-boundary";
import { DecisionWorkspace } from "@/components/decision-workspace";
import { PriceChart } from "@/components/price-chart";
import { StatusBadge } from "@/components/status-badge";
import {
  FIXTURE_FORECASTS,
  formatCurrency,
  formatPercent,
  formatUtc,
  getBlindStockPageBySymbol,
  getForecastById,
} from "@/modules/view-model";

interface StockPageProps {
  readonly params: Promise<{ symbol: string }>;
}

export function generateStaticParams() {
  return FIXTURE_FORECASTS.map((forecast) => ({
    symbol: forecast.symbol.toLowerCase(),
  }));
}

export async function generateMetadata({
  params,
}: StockPageProps): Promise<Metadata> {
  const page = getBlindStockPageBySymbol((await params).symbol);
  return page
    ? {
        title: `${page.symbol} fixture workspace`,
        description: `Inspect the frozen synthetic ${page.symbol} market workspace and reveal its Jev judgment.`,
      }
    : { title: "Symbol not found" };
}

export default async function StockPage({ params }: StockPageProps) {
  const page = getBlindStockPageBySymbol((await params).symbol);
  if (!page) notFound();

  const openlyRevealedForecast = page.pickEligible
    ? null
    : getForecastById(page.forecastId);
  if (!page.pickEligible && !openlyRevealedForecast) notFound();

  return (
    <div className="page-wrap stock-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/explore">Explore</Link>
        <span>/</span>
        <span aria-current="page">{page.symbol}</span>
      </nav>
      <header className="instrument-header">
        <div>
          <div className="instrument-title-line">
            <h1>{page.symbol}</h1>
            <StatusBadge state={page.displayState} />
          </div>
          <p>{page.company} · fictional fixture · XNAS · USD</p>
        </div>
        <div className="instrument-quote">
          <strong>{formatCurrency(page.price)}</strong>
          <span
            className={page.sessionChangePercent >= 0 ? "positive" : "negative"}
          >
            {formatPercent(page.sessionChangePercent)} fixture session
          </span>
        </div>
      </header>

      <section
        className={`state-notice state-notice-${page.displayState}`}
        role="status"
      >
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>
            {page.displayState === "current"
              ? "Synthetic fixture — no live feed"
              : page.displayState.toUpperCase()}
          </strong>
          <p>{page.stateMessage}</p>
        </div>
        <Link href="/methodology#public-states">State rules</Link>
      </section>

      {page.pickEligible ? (
        <BlindDecisionBoundary reveal={page.reveal} />
      ) : (
        <>
          <section
            className="panel muted-panel"
            aria-labelledby="pick-unavailable-title"
          >
            <LockKeyhole aria-hidden="true" />
            <div>
              <p className="eyebrow">BLIND PICK UNAVAILABLE</p>
              <h2 id="pick-unavailable-title">
                This fixture state cannot accept a new pick
              </h2>
              <p>
                Only a current, unrevealed synthetic cohort enables the
                browser-local game. Every other product flow remains available.
              </p>
            </div>
          </section>
          <DecisionWorkspace forecast={openlyRevealedForecast!} />
        </>
      )}

      <section className="market-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SYNTHETIC ADJUSTED CLOSES</p>
            <h2>Frozen market context</h2>
          </div>
          <div className="freshness-label">
            <Clock3 aria-hidden="true" />
            <span>
              Latest included session
              <br />
              <strong>{page.latestMarketSession}</strong>
            </span>
          </div>
        </div>
        <PriceChart points={page.chart} symbol={page.symbol} />
      </section>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="evidence-heading">
          <p className="eyebrow">COMPACT MARKET STATE</p>
          <h2 id="evidence-heading">Evidence available for the decision</h2>
          <p className="muted">
            Derived descriptors and structured facts only. No raw article,
            filing, or provider-native payload is present.
          </p>
          <dl className="evidence-list">
            {page.evidence.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel" aria-labelledby="metadata-heading">
          <p className="eyebrow">REPRODUCIBILITY</p>
          <h2 id="metadata-heading">Frozen metadata</h2>
          <dl className="metadata-list">
            <div>
              <dt>Decision ID</dt>
              <dd>
                <code>{page.forecastId}</code>
              </dd>
            </div>
            <div>
              <dt>Cutoff</dt>
              <dd>{formatUtc(page.cutoffAt)}</dd>
            </div>
            <div>
              <dt>Latest session</dt>
              <dd>{page.latestMarketSession}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{page.modelVersion}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{page.policyVersion}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>{page.sourceReferenceCount} hashed fixture references</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
