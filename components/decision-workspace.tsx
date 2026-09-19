import { ArrowRight, Fingerprint, Info } from "lucide-react";
import Link from "next/link";

import { formatUtc } from "@/modules/view-model";
import type { ForecastView } from "@/modules/view-model";

import { ProbabilityBars } from "./probability-bars";
import { RiskTriptych } from "./risk-triptych";

export function DecisionWorkspace({
  forecast,
}: {
  readonly forecast: ForecastView;
}) {
  if (!forecast.judgment || !forecast.action) {
    return (
      <div className="revealed-decision">
        <section className="panel muted-panel" aria-labelledby="decision-state">
          <Info aria-hidden="true" />
          <div>
            <p className="eyebrow">DECISION UNAVAILABLE</p>
            <h2 id="decision-state">No publishable Jev decision exists</h2>
            <p>{forecast.stateMessage}</p>
          </div>
        </section>
        <section
          className="panel decision-history"
          aria-labelledby="history-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">ATTEMPT HISTORY</p>
              <h2 id="history-heading">Append-only fixture timeline</h2>
            </div>
            <Fingerprint aria-hidden="true" />
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
        </section>
      </div>
    );
  }
  const actionSuppressed = ["stale", "incomplete", "failed", "void"].includes(
    forecast.displayState,
  );

  return (
    <div className="revealed-decision">
      <div className="decision-workspace">
        <section className="judgment-panel" aria-labelledby="judgment-heading">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">FROZEN JEV JUDGMENT</p>
              <h2 id="judgment-heading">
                {forecast.judgment.choice.toUpperCase()} leads the distribution
              </h2>
            </div>
            <span
              className={`confidence-badge confidence-${forecast.judgment.confidenceLabel.toLowerCase()}`}
            >
              {forecast.judgment.confidenceLabel} CONFIDENCE
            </span>
          </div>
          <ProbabilityBars judgment={forecast.judgment} />
          <div className="score-row">
            <div>
              <span>Setup quality</span>
              <strong>{forecast.judgment.setupQuality.toFixed(1)} / 3</strong>
            </div>
            <div>
              <span>Downside hazard</span>
              <strong>{forecast.judgment.downsideHazard.toFixed(1)} / 3</strong>
            </div>
            <div>
              <span>Evidence sufficiency</span>
              <strong>
                {forecast.judgment.evidenceSufficiency.toFixed(1)} / 3
              </strong>
            </div>
          </div>
          <p className="inline-disclosure">
            <Info aria-hidden="true" /> This distribution is a model judgment
            over the declared direction labels. It has not been calibrated as a
            probability of profit.
          </p>
        </section>

        <aside className="action-panel" aria-labelledby="action-heading">
          <p className="eyebrow">CODE-OWNED POLICY ACTION</p>
          <h2
            id="action-heading"
            className={actionSuppressed ? "action-suppressed" : ""}
          >
            {forecast.action}
          </h2>
          <p>
            {actionSuppressed
              ? "Current-action emphasis is suppressed for this state."
              : `${forecast.policyVersion} applied deterministic gates after Jev returned its typed answers.`}
          </p>
          <dl>
            <div>
              <dt>Mode</dt>
              <dd>{forecast.mode}</dd>
            </div>
            <div>
              <dt>Horizon</dt>
              <dd>{forecast.horizonSessions} sessions</dd>
            </div>
            <div>
              <dt>Neutral band</dt>
              <dd>±{forecast.neutralBandPercent}% inclusive</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{forecast.forecastStatus}</dd>
            </div>
          </dl>
          {forecast.pickEligible ? (
            <p className="inline-disclosure">
              This blind fixture stays off public audit and share routes. Its
              revealed record remains in this browser session.
            </p>
          ) : (
            <Link
              className="button button-secondary full-width"
              href={`/forecasts/${forecast.id}`}
            >
              Audit immutable record <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </aside>
      </div>
      <RiskTriptych forecast={forecast} />
      <section
        className="panel decision-history"
        aria-labelledby="history-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">DECISION HISTORY</p>
            <h2 id="history-heading">Append-only fixture timeline</h2>
          </div>
          <Fingerprint aria-hidden="true" />
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
      </section>
    </div>
  );
}
