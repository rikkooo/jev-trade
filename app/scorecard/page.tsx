import { BarChart3, Beaker, CircleDashed, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FIXTURE_SCORECARD, formatUtc } from "@/modules/view-model";

export const metadata: Metadata = { title: "Prospective scorecard" };

const metrics = [
  ["Multiclass Brier", FIXTURE_SCORECARD.metrics.brierScore],
  ["Log loss", FIXTURE_SCORECARD.metrics.logLoss],
  ["Publication success", FIXTURE_SCORECARD.metrics.publicationSuccessRate],
  ["Coverage rate", FIXTURE_SCORECARD.metrics.coverageRate],
  ["Pass / wait rate", FIXTURE_SCORECARD.metrics.passRate],
  ["Hit rate · secondary", FIXTURE_SCORECARD.metrics.hitRate],
  ["Paper return", FIXTURE_SCORECARD.metrics.paperReturn],
  ["Maximum drawdown", FIXTURE_SCORECARD.metrics.maximumDrawdown],
  ["Turnover", FIXTURE_SCORECARD.metrics.turnover],
] as const;

export default function ScorecardPage() {
  return (
    <div className="page-wrap scorecard-page">
      <header className="page-header with-badge">
        <div>
          <p className="eyebrow">PUBLIC PROSPECTIVE RECORD</p>
          <h1>Scorecard is ready for evidence</h1>
          <p>
            The fixture release starts at zero. Synthetic forecasts demonstrate
            the interface and are permanently excluded from public performance
            claims.
          </p>
        </div>
        <span className="simulation-stamp">FIXTURE COHORT · NOT SCORED</span>
      </header>

      <section className="scorecard-warning">
        <Beaker aria-hidden="true" />
        <div>
          <strong>No prospective sample yet</strong>
          <p>
            Metrics stay blank until eligible forecasts are frozen before their
            horizons begin, externally verified, and later resolved. There is no
            retrospective or fixture performance headline.
          </p>
          <p>{FIXTURE_SCORECARD.scoringContract.lowSampleWarning}</p>
        </div>
        <Link href="/methodology#scorecard">Scoring contract</Link>
      </section>

      <section
        className="scorecard-kpis"
        aria-label="Prospective scorecard status"
      >
        <article>
          <span>Eligible forecasts</span>
          <strong>{FIXTURE_SCORECARD.prospectiveSampleSize}</strong>
          <small>
            Target: at least{" "}
            {FIXTURE_SCORECARD.scoringContract.minimumForecasts}
          </small>
        </article>
        <article>
          <span>Distinct resolution dates</span>
          <strong>{FIXTURE_SCORECARD.distinctResolutionDates}</strong>
          <small>Correlated dates reported</small>
        </article>
        <article>
          <span>Active horizons</span>
          <strong>{FIXTURE_SCORECARD.activeHorizons} / 3</strong>
          <small>1, 5, and 20 sessions</small>
        </article>
        <article>
          <span>Last projection refresh</span>
          <strong>Fixture only</strong>
          <small>{formatUtc(FIXTURE_SCORECARD.lastRefresh)}</small>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CALIBRATION AND PERFORMANCE</p>
            <h2>Metrics remain intentionally blank</h2>
          </div>
          <CircleDashed aria-hidden="true" />
        </div>
        <div className="metric-placeholder-grid">
          {metrics.map(([label]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>—</strong>
              <small>Awaiting eligible prospective outcomes</small>
            </article>
          ))}
        </div>
      </section>

      <div className="scorecard-columns">
        <section className="panel">
          <p className="eyebrow">DECLARED COMPARATORS</p>
          <h2>Baselines registered before scoring</h2>
          <div className="baseline-list">
            {FIXTURE_SCORECARD.baselines.map((baseline) => (
              <article key={baseline.id}>
                <strong>{baseline.label}</strong>
                <span>
                  {baseline.metricClass === "direction"
                    ? "Same multiclass cohort"
                    : "Equal-weight portfolio comparator"}
                </span>
              </article>
            ))}
          </div>
          <p className="muted">
            No baseline value is shown until the same eligible cohort can be
            scored for every comparator.
          </p>
        </section>
        <section className="panel calibration-placeholder">
          <BarChart3 aria-hidden="true" />
          <p className="eyebrow">RELIABILITY BUCKETS</p>
          <h2>No calibration shape yet</h2>
          <p>
            Reliability requires resolved probabilities across enough distinct
            dates. Same-session symbols and overlapping 20-session windows will
            be labeled as correlated.
          </p>
          <p className="muted">
            Adjacent buckets merge below{" "}
            {FIXTURE_SCORECARD.scoringContract.reliabilityMinimumBucketSize}{" "}
            resolved observations.
          </p>
        </section>
      </div>

      <section className="panel">
        <p className="eyebrow">PUBLIC PROOF STATUS</p>
        <h2>No external prospective attestation</h2>
        <div className="baseline-list">
          <article>
            <strong>Fixture manual proof</strong>
            <span>Reproducible local SHA-256 root chain</span>
          </article>
          <article>
            <strong>External attestation</strong>
            <span>{FIXTURE_SCORECARD.proof.externalAttestation}</span>
          </article>
          <article>
            <strong>Prospective eligibility</strong>
            <span>
              {FIXTURE_SCORECARD.proof.prospectiveScorecardEligible
                ? "Eligible"
                : "Excluded"}
            </span>
          </article>
        </div>
        <p className="muted">
          The manual fixture artifact proves deterministic reconstruction only.
          It is not an external timestamp and cannot enter the public scorecard.
        </p>
      </section>

      <section className="visitor-score-panel">
        <LockKeyhole aria-hidden="true" />
        <div>
          <p className="eyebrow">VISITOR GAME · SEPARATE SAMPLE</p>
          <h2>
            Unauthenticated engagement data stays outside the attested record
          </h2>
          <p>
            Browser-local fixture picks are not uploaded. A future consented
            aggregate will be labeled uncontrolled and will never be mixed with
            the Jev scorecard.
          </p>
        </div>
      </section>
    </div>
  );
}
