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

/** SECURITY DEFINER entry points granted by the initial ledger migration. */
export const ledgerProcedureGrants = {
  jev_public_reader: ["public_mode_gate"],
  jev_public_ingest: ["record_visitor_pick", "record_analytics_event"],
  jev_worker: [
    "public_mode_gate",
    "append_market_bar",
    "append_market_snapshot",
    "append_judgment_run",
    "append_policy_decision",
    "publish_forecast",
    "append_forecast_terminal_event",
    "append_forecast_outcome",
    "append_paper_event",
    "append_job_operation",
    "append_job_attempt",
    "append_job_attempt_event",
    "append_ledger_root",
    "append_visitor_pick_result",
    "purge_expired_identifiers",
  ],
  jev_operator: [
    "public_mode_gate",
    "upsert_symbol",
    "append_provider_rights",
    "append_processor_terms",
    "append_forecast_correction_event",
    "append_forecast_outcome_correction",
    "append_paper_correction",
    "append_job_operation",
    "append_job_attempt",
    "append_job_attempt_event",
    "purge_expired_identifiers",
  ],
} as const;
