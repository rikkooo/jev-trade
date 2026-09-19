import { ArrowLeft, FlaskConical, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProbabilityBars } from "@/components/probability-bars";
import {
  FIXTURE_FORECASTS,
  formatUtc,
  getForecastById,
} from "@/modules/view-model";

interface SharePageProps {
  readonly params: Promise<{ id: string }>;
}
export function generateStaticParams() {
  return FIXTURE_FORECASTS.map(({ id }) => ({ id }));
}

export default async function SharePage({ params }: SharePageProps) {
  const forecast = getForecastById((await params).id);
  if (!forecast) notFound();
  return (
    <div className="page-wrap share-page">
      <Link className="back-link" href={`/forecasts/${forecast.id}`}>
        <ArrowLeft aria-hidden="true" /> Back to audit record
      </Link>
      <article className="share-card">
        <div className="share-card-brand">
          <span>
            <FlaskConical aria-hidden="true" /> JEV TRADE
          </span>
          <strong>SYNTHETIC SIMULATION</strong>
        </div>
        <div className="share-card-body">
          <p className="eyebrow">FROZEN MARKET JUDGMENT</p>
          <h1>
            {forecast.symbol}{" "}
            <span>
              {forecast.mode} · {forecast.horizonSessions} SESSIONS
            </span>
          </h1>
          <div className="share-action">
            <span>Jev judged</span>
            <strong>{forecast.judgment.choice.toUpperCase()}</strong>
            <small>Policy action · {forecast.action}</small>
          </div>
          <ProbabilityBars judgment={forecast.judgment} />
          <div className="share-risk">
            <div>
              <span>Market risk</span>
              <strong>
                {forecast.marketRisk.index} · {forecast.marketRisk.band}
              </strong>
            </div>
            <div>
              <span>Maximum planned loss</span>
              <strong>
                {forecast.positionRisk.kind === "active"
                  ? `$${forecast.positionRisk.maximumPlannedLoss.toFixed(2)}`
                  : "$0.00"}
              </strong>
            </div>
          </div>
        </div>
        <footer>
          <span>
            <LockKeyhole aria-hidden="true" /> Frozen{" "}
            {formatUtc(forecast.cutoffAt)}
          </span>
          <code>{forecast.id}</code>
          <p>
            Synthetic fixture data · Model judgment is not a probability of
            profit · No real trades
          </p>
        </footer>
      </article>
      <p className="share-note">
        This preview is designed for honest screenshots: the simulation label,
        cutoff, risk, and permanent decision ID remain visible.
      </p>
    </div>
  );
}
