import { ArrowRight, EyeOff, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { formatCurrency, formatPercent, formatUtc } from "@/modules/view-model";
import type { StockSummaryView } from "@/modules/view-model";

import { StatusBadge } from "./status-badge";

export function ForecastCard({ stock }: { readonly stock: StockSummaryView }) {
  return (
    <article
      className={`forecast-card${stock.blind ? " forecast-card-blind" : ""}`}
    >
      <div className="forecast-card-topline">
        <StatusBadge state={stock.displayState} />
        <span>
          {stock.mode} · {stock.horizonSessions} sessions
        </span>
      </div>
      <div className="forecast-card-heading">
        <div>
          <h3>{stock.symbol}</h3>
          <p>{stock.company}</p>
        </div>
        <div className="quote">
          <strong>{formatCurrency(stock.price)}</strong>
          <span
            className={
              stock.sessionChangePercent >= 0 ? "positive" : "negative"
            }
          >
            {formatPercent(stock.sessionChangePercent)}
          </span>
        </div>
      </div>
      {stock.blind ? (
        <div className="blind-summary">
          <EyeOff aria-hidden="true" />
          <div>
            <strong>Blind pick open</strong>
            <p>
              Jev judgment, policy action, and risk output stay hidden until
              reveal.
            </p>
          </div>
        </div>
      ) : stock.decisionAvailable ? (
        <div className="forecast-callout">
          <div>
            <span>Policy action</span>
            <strong>{stock.action}</strong>
          </div>
          <div>
            <span>Market risk band</span>
            <strong>{stock.marketRiskBand ?? "—"}</strong>
          </div>
          <div>
            <span>Data mode</span>
            <strong>SYNTHETIC</strong>
          </div>
        </div>
      ) : (
        <div className="blind-summary">
          <EyeOff aria-hidden="true" />
          <div>
            <strong>Decision unavailable</strong>
            <p>No validated Jev response or policy action was published.</p>
          </div>
        </div>
      )}
      <div className="forecast-card-meta">
        <LockKeyhole aria-hidden="true" />
        <div>
          <span>Cutoff · {formatUtc(stock.cutoffAt)}</span>
          <span>Latest session · {stock.latestMarketSession}</span>
          <span>
            Versions · {stock.modelVersion} · {stock.policyVersion}
          </span>
          <span>Immutable fixture ID · {stock.forecastId}</span>
        </div>
      </div>
      <div className="card-links">
        <Link href={`/stocks/${stock.symbol.toLowerCase()}`}>
          {stock.blind ? "Make a pick" : "Open workspace"}{" "}
          <ArrowRight aria-hidden="true" />
        </Link>
        {!stock.blind ? (
          <Link href={`/forecasts/${stock.forecastId}`}>Audit record</Link>
        ) : null}
      </div>
    </article>
  );
}
