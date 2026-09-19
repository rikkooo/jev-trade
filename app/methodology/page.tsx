import {
  BrainCircuit,
  Calculator,
  Database,
  FileClock,
  Scale,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Methodology and disclosures" };

const sections = [
  [
    "01",
    "Freeze",
    "A completed synthetic fixture session and its source references are frozen at a declared cutoff.",
  ],
  [
    "02",
    "Judge",
    "Jev answers four narrow typed questions from compact derived descriptors.",
  ],
  [
    "03",
    "Apply policy",
    "Code checks data quality, risk, confidence, sizing, stops, and horizons in a fixed order.",
  ],
  [
    "04",
    "Append",
    "The decision, versions, hashes, and later lifecycle events are retained as an immutable record.",
  ],
  [
    "05",
    "Resolve",
    "Code labels the exact fixed-horizon adjusted return and scores it against declared baselines.",
  ],
] as const;

export default function MethodologyPage() {
  return (
    <div className="page-wrap methodology-page">
      <header className="page-header">
        <p className="eyebrow">METHODOLOGY · VERSION 1.0</p>
        <h1>How Jev Trade makes a decision inspectable</h1>
        <p>
          Jev supplies bounded judgment. Versioned code owns arithmetic, dates,
          market calendars, risk, sizing, actions, and outcomes.
        </p>
        <div className="methodology-meta">
          <span>Effective 2026-09-19</span>
          <span>Fixture release</span>
          <span>Prospective sample: 0</span>
        </div>
      </header>

      <nav className="methodology-nav" aria-label="On this page">
        <a href="#fixture-release">Fixture release</a>
        <a href="#data-timing">Data timing</a>
        <a href="#three-risks">Three risk concepts</a>
        <a href="#policy">Policy</a>
        <a href="#scorecard">Scorecard</a>
        <a href="#corrections">Corrections</a>
        <a href="#privacy">Privacy</a>
        <a href="#disclosures">Disclosures</a>
      </nav>

      <section className="method-flow" aria-labelledby="flow-title">
        <p className="eyebrow">DECISION PIPELINE</p>
        <h2 id="flow-title">Five accountable steps</h2>
        <ol>
          {sections.map(([number, title, body]) => (
            <li key={number}>
              <span>{number}</span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="method-section" id="fixture-release">
        <div className="method-icon">
          <Database aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">CURRENT RELEASE BOUNDARY</p>
          <h2>Synthetic fixtures only</h2>
          <p>
            All symbols, prices, bars, events, forecasts, outcomes, and paper
            transactions in this release are invented test fixtures. There is no
            live or delayed market feed, no brokerage, no durable visitor write,
            and no public prospective score.
          </p>
          <p>
            Live display stays off until a provider-rights record explicitly
            covers fields, audience, retention, attribution, derived outputs,
            screenshots and video, and onward AI processing.
          </p>
        </div>
      </section>

      <section className="method-section" id="data-timing">
        <div className="method-icon">
          <FileClock aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">POINT-IN-TIME BOUNDARY</p>
          <h2>Only information available by the cutoff</h2>
          <p>
            A snapshot identifies its knowledge cutoff, provider fetch time,
            latest completed session, source revision, availability time, and
            content hash. References after the cutoff are rejected. A forecast
            never uses a bar inside its own evaluation window.
          </p>
          <p>
            Position and Sprint horizons count eligible completed exchange
            sessions. Weekends and exchange holidays do not count.
          </p>
        </div>
      </section>

      <section className="method-section" id="three-risks">
        <div className="method-icon">
          <BrainCircuit aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">CONCEPTUAL SEPARATION</p>
          <h2>Three measures answer three different questions</h2>
          <div className="definition-grid">
            <article>
              <strong>Jev judgment distribution</strong>
              <p>
                How the model distributes belief across UP, FLAT, and DOWN for a
                fixed contract. It is not a chance of profit.
              </p>
            </article>
            <article>
              <strong>Deterministic market-risk index</strong>
              <p>
                A 0–100 code calculation: volatility percentile 35%, drawdown
                20%, normalized ATR 20%, gap risk 10%, known-event proximity
                15%.
              </p>
            </article>
            <article>
              <strong>Deterministic position-risk dollars</strong>
              <p>
                For an open Position trade: entry-to-stop loss across virtual
                shares, capped by equity and notional rules. Sprint has zero
                position risk.
              </p>
            </article>
          </div>
          <p>
            Market-risk bands are provisional heuristics: LOW 0–34, MEDIUM
            35–64, HIGH 65–100.
          </p>
        </div>
      </section>

      <section className="method-section" id="position-risk">
        <div className="method-icon">
          <ShieldCheck aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">POSITION SIZING</p>
          <h2>Capital loss is calculated by code</h2>
          <ul>
            <li>Fixture starting equity: USD 100,000.</li>
            <li>
              Maximum loss for a new trade at its stop: 1% of current paper
              equity.
            </li>
            <li>
              Maximum notional for one trade: 20% of current paper equity.
            </li>
            <li>
              Maximum aggregate planned loss: 5% of equity, across no more than
              five positions.
            </li>
            <li>
              Initial stop distance: the greater of 2 × ATR(14) and 4% of entry.
            </li>
            <li>
              Paper entry and exit: next eligible unadjusted open with 10 basis
              points adverse execution per side.
            </li>
          </ul>
        </div>
      </section>

      <section className="method-section" id="policy">
        <div className="method-icon">
          <Calculator aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">CODE-OWNED ACTIONS</p>
          <h2>Jev judges; policy acts</h2>
          <p>
            Position mode evaluates a long-only setup over 20 completed sessions
            and can return ENTER, HOLD, EXIT, or WAIT. Sprint predicts UP, FLAT,
            or DOWN over 1 or 5 sessions and can PASS. Sprint DOWN is a
            direction label, never a short sale.
          </p>
          <p>
            Fixed inclusive FLAT bands are ±2.0% for Position/20, ±0.5% for
            Sprint/1, and ±1.5% for Sprint/5. Stops, horizon expiry, and invalid
            data override contrary model judgment.
          </p>
        </div>
      </section>

      <section className="method-section" id="scorecard">
        <div className="method-icon">
          <Scale aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">PROSPECTIVE EVALUATION</p>
          <h2>Calibration before headlines</h2>
          <p>
            The scorecard reports sample size, distinct resolution dates,
            coverage/pass rate, multiclass Brier score, log loss where defined,
            reliability buckets, hit rate, paper return, maximum drawdown, and
            turnover. It never leads with hit rate alone.
          </p>
          <p>
            Jev is compared with always-up, deterministic momentum, and
            eligible-universe buy-and-hold baselines. A learning review requires
            at least 100 resolved prospective forecasts across at least 20
            symbols and 20 distinct resolution dates, with at least 20 forecasts
            per active horizon. This is not a claim of statistical significance.
          </p>
        </div>
      </section>

      <section className="method-section" id="public-states">
        <div className="method-icon">
          <Database aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">PUBLIC STATES</p>
          <h2>Old or broken data never looks current</h2>
          <dl className="state-definitions">
            <div>
              <dt>Stale</dt>
              <dd>
                Historical output remains visible; current-action emphasis and
                new picks are disabled.
              </dd>
            </div>
            <div>
              <dt>Incomplete</dt>
              <dd>Only validated fields render; no new action is taken.</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>
                The prior published record remains; the failure is named and
                never replaced with a fabricated judgment.
              </dd>
            </div>
            <div>
              <dt>Void</dt>
              <dd>
                The full record remains visible, carries a machine-readable
                reason, and is excluded from metrics.
              </dd>
            </div>
            <div>
              <dt>Corrected</dt>
              <dd>
                The original and replacement remain linked; the active
                projection names the correction.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="method-section" id="corrections">
        <div className="method-icon">
          <FileClock aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">APPEND-ONLY HISTORY</p>
          <h2>Corrections add context; they do not erase</h2>
          <p>
            A bad source record or outcome is marked, then a correction event
            links the original and replacement. The original forecast, Jev
            answer, policy decision, and outcome remain addressable. Voids
            remain visible with a reason and count, even when excluded from
            performance metrics.
          </p>
        </div>
      </section>

      <section className="method-section" id="privacy">
        <div className="method-icon">
          <ShieldCheck aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">PRIVACY</p>
          <h2>Analytics begin only after opt-in</h2>
          <p>
            Ignoring or declining the prompt leaves every flow usable and
            creates no analytics identifier. Accepting creates a random browser
            identifier with a 30-day local expiry. The fixture release uploads
            no analytics and stores blind picks only in the visitor’s browser.
            Clearing site data removes both.
          </p>
        </div>
      </section>

      <section className="disclosure-panel" id="disclosures">
        <p className="eyebrow">SIMULATION DISCLOSURES</p>
        <h2>Read this before interpreting any card</h2>
        <ul>
          <li>
            Jev Trade is an experiment and market simulation, not investment
            advice.
          </li>
          <li>
            No real order is submitted and no return is guaranteed or implied.
          </li>
          <li>
            Jev confidence describes answer confidence, not a probability of
            profit.
          </li>
          <li>
            Fixture quotes, companies, forecasts, and results are invented and
            cannot support performance claims.
          </li>
          <li>
            Paper fills omit liquidity, partial fills, taxes, fees beyond the
            declared assumption, and many real-world execution constraints.
          </li>
        </ul>
        <p className="version-note" id="versions">
          <strong>Frozen versions:</strong> methodology-v1.0 · market-state-v1 ·
          jev-questions-v1 · paper-policy-v1 · market-risk-v1 · position-risk-v1
          · direction-outcome-v1.
        </p>
        <Link className="button button-secondary" href="/scorecard">
          Open scorecard readiness
        </Link>
      </section>
    </div>
  );
}
