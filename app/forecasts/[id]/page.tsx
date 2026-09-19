import {
  Check,
  Copy,
  ExternalLink,
  Fingerprint,
  LockKeyhole,
  Share2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProbabilityBars } from "@/components/probability-bars";
import { RiskTriptych } from "@/components/risk-triptych";
import { StatusBadge } from "@/components/status-badge";
import {
  formatPercent,
  formatUtc,
  getFixtureForecastStaticParams,
  getForecastById,
} from "@/modules/view-model";

interface ForecastPageProps {
  readonly params: Promise<{ id: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getFixtureForecastStaticParams();
}

export async function generateMetadata({
  params,
}: ForecastPageProps): Promise<Metadata> {
  const forecast = getForecastById((await params).id);
  return forecast
    ? {
        title: `${forecast.symbol} immutable forecast`,
        description: `Audit synthetic fixture decision ${forecast.id}.`,
      }
    : { title: "Forecast not found" };
}

export default async function ForecastPage({ params }: ForecastPageProps) {
  const forecast = getForecastById((await params).id);
  if (!forecast || forecast.pickEligible) notFound();
  return (
    <div className="page-wrap audit-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/explore">Explore</Link>
        <span>/</span>
        <Link href={`/stocks/${forecast.symbol.toLowerCase()}`}>
          {forecast.symbol}
        </Link>
        <span>/</span>
        <span aria-current="page">Forecast</span>
      </nav>
      <header className="audit-header">
        <div>
          <p className="eyebrow">PERMANENT FIXTURE AUDIT VIEW</p>
          <div className="instrument-title-line">
            <h1>
              {forecast.symbol} · {forecast.mode} {forecast.horizonSessions}S
            </h1>
            <StatusBadge state={forecast.displayState} />
          </div>
          <p className="audit-id">
            <LockKeyhole aria-hidden="true" />
            <code>{forecast.id}</code>
          </p>
        </div>
        <Link
          className="button button-secondary"
          href={`/forecasts/${forecast.id}/share`}
        >
          <Share2 aria-hidden="true" /> Open share card
        </Link>
      </header>

      <section className="immutable-banner">
        <Fingerprint aria-hidden="true" />
        <div>
          <strong>Frozen synthetic record</strong>
          <p>
            This view preserves the fixture inputs, Jev response, code-owned
            policy trace, and later lifecycle events. It is not part of a public
            prospective scorecard.
          </p>
        </div>
      </section>

      {forecast.correction ? (
        <section className="correction-banner" role="status">
          <strong>Append-only correction</strong>
          <p>
            {forecast.correction.reason} Original:{" "}
            {forecast.correction.originalOutcome.toUpperCase()}. Active:{" "}
            {forecast.correction.activeOutcome.toUpperCase()}. Appended{" "}
            {formatUtc(forecast.correction.at)}.
          </p>
        </section>
      ) : null}
      {forecast.voidReason ? (
        <section className="void-banner" role="status">
          <strong>Void — excluded from all metrics</strong>
          <p>{forecast.voidReason}</p>
        </section>
      ) : null}

      <div className="audit-summary-grid">
        <section className="panel">
          {forecast.judgment ? (
            <>
              <p className="eyebrow">TYPED JEV RESPONSE</p>
              <h2>
                {forecast.judgment.choice.toUpperCase()} ·{" "}
                {Math.round(forecast.judgment.confidence * 100)}% answer
                confidence
              </h2>
              <ProbabilityBars judgment={forecast.judgment} />
              <p className="inline-disclosure">
                Model judgment only; not a calibrated chance of profit.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">JEV RESPONSE STATUS</p>
              <h2>No validated Jev response</h2>
              <p className="inline-disclosure">{forecast.stateMessage}</p>
            </>
          )}
        </section>
        <section className="panel action-record">
          <p className="eyebrow">DETERMINISTIC POLICY RECORD</p>
          <h2>{forecast.action ?? "NOT RUN"}</h2>
          <dl>
            <div>
              <dt>Policy</dt>
              <dd>{forecast.policyVersion}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{forecast.forecastStatus}</dd>
            </div>
            <div>
              <dt>Prospective status</dt>
              <dd>{forecast.prospectiveStatus}</dd>
            </div>
            <div>
              <dt>Neutral band</dt>
              <dd>±{forecast.neutralBandPercent}% inclusive</dd>
            </div>
          </dl>
        </section>
      </div>

      <RiskTriptych forecast={forecast} />

      {forecast.outcome ? (
        <section className="outcome-panel">
          <div>
            <p className="eyebrow">FIXED-HORIZON OUTCOME</p>
            <h2>{forecast.outcome.label.toUpperCase()}</h2>
          </div>
          <dl>
            <div>
              <dt>Adjusted return</dt>
              <dd>
                {formatPercent(forecast.outcome.adjustedReturnPercent, 2)}
              </dd>
            </div>
            <div>
              <dt>Resolved</dt>
              <dd>{formatUtc(forecast.outcome.resolvedAt)}</dd>
            </div>
            <div>
              <dt>Paper P&amp;L</dt>
              <dd>
                {forecast.outcome.paperPnl === undefined
                  ? "Not applicable"
                  : `$${forecast.outcome.paperPnl.toFixed(2)} · separate from direction score`}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {forecast.gates.length > 0 ? (
        <section className="panel" aria-labelledby="gates-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">POLICY TRACE</p>
              <h2 id="gates-heading">Ordered deterministic gates</h2>
            </div>
            <span className="mono-tag">{forecast.policyVersion}</span>
          </div>
          <div className="table-scroll">
            <table>
              <caption>Ordered gate decisions for {forecast.id}</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Gate</th>
                  <th scope="col">Result</th>
                  <th scope="col">Recorded reason</th>
                </tr>
              </thead>
              <tbody>
                {forecast.gates.map((gate) => (
                  <tr key={gate.order}>
                    <td>{String(gate.order).padStart(2, "0")}</td>
                    <th scope="row">{gate.id}</th>
                    <td>
                      <span
                        className={`gate-result gate-${gate.status.replace("_", "-")}`}
                      >
                        {gate.status === "pass" ? (
                          <Check aria-hidden="true" />
                        ) : null}
                        {gate.status.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {gate.reason} Rule: {gate.rule}. Recorded value:{" "}
                      {gate.actual === null ? "n/a" : String(gate.actual)}.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel muted-panel" aria-labelledby="gates-heading">
          <div>
            <p className="eyebrow">POLICY TRACE</p>
            <h2 id="gates-heading">Policy was not run</h2>
            <p>{forecast.stateMessage}</p>
          </div>
        </section>
      )}

      <div className="detail-grid">
        <section className="panel">
          <p className="eyebrow">IMMUTABLE INPUT IDENTITY</p>
          <h2>Versions and content address</h2>
          <dl className="metadata-list">
            <div>
              <dt>Decision ID</dt>
              <dd>
                <code>{forecast.id}</code>
              </dd>
            </div>
            <div>
              <dt>State hash</dt>
              <dd className="hash">
                <code>{forecast.decisionStateHash}</code>
              </dd>
            </div>
            <div>
              <dt>Judgment input hash</dt>
              <dd className="hash">
                <code>{forecast.judgmentInputHash}</code>
              </dd>
            </div>
            <div>
              <dt>Question set</dt>
              <dd>{forecast.questionVersion}</dd>
            </div>
            <div>
              <dt>Model build</dt>
              <dd>{forecast.modelVersion}</dd>
            </div>
            <div>
              <dt>Methodology</dt>
              <dd>
                <Link href="/methodology#versions">
                  {forecast.methodologyVersion}
                </Link>
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <p className="eyebrow">TIMING BOUNDARY</p>
          <h2>What the decision could know</h2>
          <dl className="metadata-list">
            <div>
              <dt>Cutoff</dt>
              <dd>{formatUtc(forecast.cutoffAt)}</dd>
            </div>
            <div>
              <dt>Latest session</dt>
              <dd>{forecast.latestMarketSession}</dd>
            </div>
            <div>
              <dt>Source freshness</dt>
              <dd>{forecast.sourceFreshness}</dd>
            </div>
            <div>
              <dt>Source references</dt>
              <dd>{forecast.sourceReferenceCount}</dd>
            </div>
          </dl>
          <p className="inline-disclosure">
            Every fixture reference is at or before the knowledge cutoff. Later
            outcomes appear only in appended events.
          </p>
        </section>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIFECYCLE</p>
            <h2>Append-only event trail</h2>
          </div>
          <Copy aria-hidden="true" />
        </div>
        <ol className="timeline">
          {forecast.timeline.map((event) => (
            <li
              key={`${event.at}-${event.label}`}
              className={`timeline-${event.tone}`}
            >
              <time dateTime={event.at}>{formatUtc(event.at)}</time>
              <div>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link className="text-link" href="/methodology#corrections">
          Read the correction and void policy{" "}
          <ExternalLink aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
