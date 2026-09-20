/** Additive Phase Two schema names owned by Issue #15 / U5. */
export const EVIDENCE_LAB_SCHEMA_VERSION = 2 as const;

export const evidenceLabTables = [
  "p2_registry_entries",
  "p2_registry_events",
  "p2_cohorts",
  "p2_cohort_events",
  "p2_source_revisions",
  "p2_evidence_states",
  "p2_operator_audit_events",
  "p2_publication_receipts",
] as const;

export const evidenceLabViews = ["p2_public_evidence_projection"] as const;

/** Only these grantable entry points are available to Phase Two runtime roles. */
export const evidenceLabProcedureGrants = {
  jev_public_reader: [] as const,
  jev_public_ingest: [] as const,
  jev_worker: [
    "p2_append_source_revision",
    "p2_append_evidence_state",
    "p2_read_evidence_state",
  ],
  jev_operator: [
    "p2_append_registry_entry",
    "p2_append_registry_event",
    "p2_append_cohort",
    "p2_append_cohort_event",
    "p2_append_source_revision",
    "p2_append_operator_audit_event",
    "p2_append_publication_receipt",
  ],
} as const;

export const evidenceLabPublicViewGrants = {
  jev_public_reader: ["p2_public_evidence_projection"],
} as const;
