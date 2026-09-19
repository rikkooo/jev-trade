/** Names shared by migration tooling and database adapters. */
export const LEDGER_SCHEMA_VERSION = 1 as const;

export const ledgerTables = [
  "symbols",
  "provider_rights",
  "processor_terms",
  "market_bars",
  "market_snapshots",
  "snapshot_bar_refs",
  "evidence_descriptors",
  "judgment_runs",
  "judgment_answers",
  "policy_decisions",
  "forecasts",
  "forecast_events",
  "forecast_outcomes",
  "paper_events",
  "job_operations",
  "job_attempts",
  "job_attempt_events",
  "ledger_roots",
  "private_identifiers",
  "visitor_picks",
  "visitor_pick_results",
  "analytics_events",
  "identifier_expiry_runs",
] as const;

export type LedgerTable = (typeof ledgerTables)[number];

export const forecastLifecycle = {
  published: ["resolved", "void"],
  resolved: ["correction"],
  void: ["correction"],
  correction: ["correction"],
} as const;

export const jobAttemptLifecycle = {
  scheduled: ["evaluating"],
  evaluating: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
} as const;
