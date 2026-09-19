import {
  AlertTriangle,
  Database,
  KeyRound,
  LockKeyhole,
  ServerCog,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operator status",
  robots: { index: false, follow: false },
};

export default function OperatorPage() {
  const durableWrites = process.env.DURABLE_WRITES === "true";
  const authorizationConfigured = Boolean(
    process.env.OPERATOR_BOOTSTRAP_SECRET,
  );
  const publicMarketData = process.env.PUBLIC_MARKET_DATA === "true";
  const controlsEnabled =
    durableWrites && authorizationConfigured && publicMarketData;
  return (
    <div className="page-wrap operator-page">
      <header className="page-header">
        <p className="eyebrow">INTERNAL SURFACE · NOINDEX</p>
        <h1>Operator status</h1>
        <p>
          This route exposes capability state only. It never exposes credentials
          or creates a privileged browser session in fixture mode.
        </p>
      </header>
      <section className="operator-lock">
        <LockKeyhole aria-hidden="true" />
        <div>
          <strong>
            {controlsEnabled
              ? "Server capabilities present — authentication still required"
              : "Mutation controls locked"}
          </strong>
          <p>
            {controlsEnabled
              ? "Use the separately authenticated operator workflow. This read-only page does not grant access."
              : "Fixture mode fails closed until server authorization, durable writes, and approved public data rights all exist."}
          </p>
        </div>
      </section>
      <section className="capability-grid">
        <article>
          <KeyRound aria-hidden="true" />
          <span>Server authorization</span>
          <strong>
            {authorizationConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
          </strong>
          <small>Secret value never reaches this page</small>
        </article>
        <article>
          <Database aria-hidden="true" />
          <span>Durable writes</span>
          <strong>{durableWrites ? "ENABLED" : "DISABLED"}</strong>
          <small>Fixture release is read-only</small>
        </article>
        <article>
          <ServerCog aria-hidden="true" />
          <span>Public market display</span>
          <strong>{publicMarketData ? "ENABLED" : "DISABLED"}</strong>
          <small>Requires recorded provider rights</small>
        </article>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">READ-ONLY QUEUE PREVIEW</p>
            <h2>No durable job store connected</h2>
          </div>
          <span className="status-badge status-incomplete">
            <AlertTriangle aria-hidden="true" /> Fixture mode
          </span>
        </div>
        <div className="operator-placeholder">
          <p>
            Universe changes, replay, corrections, and public-mode controls stay
            disabled. They require authenticated server routes, origin checks,
            idempotency keys, and append-only audit results.
          </p>
          <div className="operator-actions">
            <button className="button button-secondary" disabled>
              Change allowlist
            </button>
            <button className="button button-secondary" disabled>
              Replay failed job
            </button>
            <button className="button button-secondary" disabled>
              Append correction
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
