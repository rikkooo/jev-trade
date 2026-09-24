/**
 * Phase Two Evidence Lab objects created by migration
 * `0002_evidence_lab_registry` (#15 / U5). The database verifier and the SQL
 * denial suite check the live schema against exactly this manifest.
 */
export const EVIDENCE_LAB_SCHEMA_VERSION =
  "0002_evidence_lab_registry" as const;

export const evidenceLabTables = [
  "p2_operator_audit_events",
  "p2_registry_entries",
  "p2_registry_events",
  "p2_cohorts",
  "p2_cohort_registry_refs",
  "p2_cohort_events",
  "p2_source_revisions",
  "p2_evidence_states",
  "p2_evidence_state_admissions",
  "p2_publication_receipts",
] as const;

/** Every Phase Two table is append-only for every role, including the owner. */
export const evidenceLabImmutableTables = evidenceLabTables;

export const evidenceLabLifecycleTriggers = [
  ["p2_registry_entries", "p2_registry_entry_contract"],
  ["p2_registry_events", "p2_registry_event_lifecycle"],
  ["p2_cohorts", "p2_cohort_version_chain"],
  ["p2_cohorts", "p2_cohort_complete_at_commit"],
  ["p2_cohort_events", "p2_cohort_event_lifecycle"],
  ["p2_source_revisions", "p2_source_revision_chain"],
  ["p2_evidence_states", "p2_evidence_state_contract"],
  ["p2_evidence_states", "p2_evidence_state_complete_at_commit"],
  ["p2_evidence_state_admissions", "p2_evidence_admission_cutoff"],
  ["p2_publication_receipts", "p2_publication_receipt_chain"],
] as const;

/** Commit-time invariants must stay deferred so multi-row appends can complete. */
export const evidenceLabDeferredTriggers = [
  "p2_cohort_complete_at_commit",
  "p2_evidence_state_complete_at_commit",
] as const;

export const evidenceLabCriticalIndexes = [
  "p2_operator_audit_accepted_key_idx",
  "p2_operator_audit_accepted_target_idx",
  "p2_registry_one_successor_idx",
  "p2_registry_event_once_idx",
  "p2_cohort_one_successor_idx",
  "p2_cohort_one_forecast_lock_idx",
  "p2_cohort_event_once_idx",
  "p2_source_one_successor_idx",
  "p2_evidence_state_one_successor_idx",
  "p2_receipt_one_head_idx",
  "p2_receipt_one_successor_idx",
] as const;

/**
 * The Phase Two privilege matrix. The public reader and public ingest roles
 * hold no Phase Two capability until a public-mode gate approves one.
 */
export const evidenceLabFunctionGrants = {
  p2_append_registry_entry: ["jev_operator"],
  p2_append_registry_event: ["jev_operator"],
  p2_append_cohort: ["jev_operator"],
  p2_append_cohort_event: ["jev_operator"],
  p2_append_rejected_operator_command: ["jev_operator"],
  p2_record_first_forecast_lock: ["jev_worker"],
  p2_append_source_revision: ["jev_worker"],
  p2_append_evidence_state: ["jev_worker"],
  p2_append_publication_receipt: ["jev_worker"],
  p2_read_registry_entry_status: ["jev_worker", "jev_operator"],
  p2_read_cohort_status: ["jev_worker", "jev_operator"],
  p2_read_source_revisions_as_of: ["jev_worker"],
  p2_read_evidence_state: ["jev_worker"],
  p2_read_receipt_authority: ["jev_worker", "jev_operator"],
} as const satisfies Record<string, readonly string[]>;

/** Deferred triggers fire outside the procedure, so they run as definer too. */
export const evidenceLabInternalDefinerFunctions = [
  "p2_check_cohort_complete",
  "p2_check_evidence_state_complete",
] as const;

export const evidenceLabInternalFunctions = [
  "p2_canonical_json",
  "p2_sha256_hex",
  "p2_invalid",
  "p2_assert_keys",
  "p2_text",
  "p2_timestamp",
  "p2_integer",
  "p2_verify_envelope",
  "p2_command_request_hash",
  "p2_registry_entry_status",
  "p2_cohort_lifecycle_event",
  "p2_cohort_status",
  "p2_registry_root_hash",
  "p2_admission_manifest_hash",
  "p2_validate_registry_entry",
  "p2_validate_registry_event",
  "p2_validate_cohort",
  "p2_assert_cohort_complete",
  "p2_check_cohort_complete",
  "p2_validate_cohort_event",
  "p2_validate_source_revision",
  "p2_validate_evidence_state",
  "p2_validate_evidence_admission",
  "p2_assert_evidence_state_complete",
  "p2_check_evidence_state_complete",
  "p2_validate_publication_receipt",
  "p2_accept_operator_command",
  "p2_assert_command_replay",
] as const;
