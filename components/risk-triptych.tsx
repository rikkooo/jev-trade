import { BrainCircuit, Gauge, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { formatCurrency, formatProbability } from "@/modules/view-model";
import type { ForecastView } from "@/modules/view-model";

export function RiskTriptych({
  forecast,
}: {
  readonly forecast: ForecastView;
}) {
  const { judgment, marketRisk, positionRisk } = forecast;
  if (!judgment) return null;
  return (
    <section aria-labelledby="risk-concepts-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THREE DIFFERENT MEASURES</p>
          <h2 id="risk-concepts-title">Judgment, market risk, position loss</h2>
        </div>
        <Link className="text-link" href="/methodology#three-risks">
          Why these stay separate
        </Link>
      </div>
      <div className="risk-triptych">
        <article className="risk-card risk-judgment">
          <div className="risk-icon">
            <BrainCircuit aria-hidden="true" />
          </div>
          <p className="eyebrow">JEV JUDGMENT</p>
          <h3>
            {formatProbability(judgment.probabilities[judgment.choice])}{" "}
            {judgment.choice.toUpperCase()}
          </h3>
          <p>
            Typed model distribution with{" "}
            {judgment.confidenceLabel.toLowerCase()} answer confidence. It is
            not calibrated as a chance of profit.
          </p>
          <dl className="mini-stats">
            <div>
              <dt>Setup quality</dt>
              <dd>{judgment.setupQuality.toFixed(1)} / 3</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>{judgment.evidenceSufficiency.toFixed(1)} / 3</dd>
            </div>
          </dl>
        </article>
        <article
          className={`risk-card risk-market risk-band-${marketRisk.band.toLowerCase()}`}
        >
          <div className="risk-icon">
            <Gauge aria-hidden="true" />
          </div>
          <p className="eyebrow">DETERMINISTIC MARKET RISK</p>
          <h3>
            {marketRisk.index} / 100 · {marketRisk.band}
          </h3>
          <p>
            Code combines volatility, drawdown, ATR, gaps, and event proximity
            under {marketRisk.formulaVersion}.
          </p>
          <div
            className="risk-meter"
            role="meter"
            aria-label="Market risk index"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={marketRisk.index}
          >
            <span style={{ width: `${marketRisk.index}%` }} />
          </div>
        </article>
        <article className="risk-card risk-position">
          <div className="risk-icon">
            <ShieldCheck aria-hidden="true" />
          </div>
          <p className="eyebrow">DETERMINISTIC POSITION RISK</p>
          {positionRisk.kind === "active" ? (
            <>
              <h3>
                {formatCurrency(positionRisk.maximumPlannedLoss)} max planned
                loss
              </h3>
              <p>
                {positionRisk.shares} virtual shares with a{" "}
                {formatCurrency(positionRisk.stop)} stop. Dollar loss is sized
                by code, not by Jev.
              </p>
              <dl className="mini-stats">
                <div>
                  <dt>Capital at risk</dt>
                  <dd>{formatCurrency(positionRisk.capitalAtRisk)}</dd>
                </div>
                <div>
                  <dt>Paper P&amp;L</dt>
                  <dd>{formatCurrency(positionRisk.currentPaperPnl)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <h3>{formatCurrency(0)} planned loss</h3>
              <p>{positionRisk.reason}</p>
              <dl className="mini-stats">
                <div>
                  <dt>Virtual shares</dt>
                  <dd>0</dd>
                </div>
                <div>
                  <dt>Capital at risk</dt>
                  <dd>{formatCurrency(0)}</dd>
                </div>
              </dl>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
