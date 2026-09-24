import type { LedgerSqlClient } from "@/modules/ledger/postgres";

import { EvidenceLabError } from "../errors";
import {
  cohortEventFieldsSchema,
  cohortFieldsSchema,
  cohortForecastLockFieldsSchema,
} from "../model/cohorts";
import { receiptObservationFieldsSchema } from "../model/receipts";
import {
  operatorAuditFieldsSchema,
  registryEntryFieldsSchema,
  registryEventFieldsSchema,
} from "../model/registry";
import {
  evidenceStateFieldsSchema,
  sourceRevisionFieldsSchema,
} from "../model/sources";
import type { AppendResult } from "./ledger";
import { parseSealed } from "./validation";

/** The only statements the operator store can issue. */
export const OPERATOR_STATEMENTS = {
  appendRegistryEntry:
    "select created, record_id from p2_append_registry_entry($1::jsonb, $2::jsonb)",
  appendRegistryEvent:
    "select created, record_id from p2_append_registry_event($1::jsonb, $2::jsonb)",
  appendCohort:
    "select created, record_id from p2_append_cohort($1::jsonb, $2::jsonb)",
  appendCohortEvent:
    "select created, record_id from p2_append_cohort_event($1::jsonb, $2::jsonb)",
  appendRejectedCommand:
    "select created, record_id from p2_append_rejected_operator_command($1::jsonb)",
  readRegistryEntryStatus:
    "select * from p2_read_registry_entry_status($1::text)",
  readCohortStatus: "select * from p2_read_cohort_status($1::text)",
  readReceiptAuthority: "select * from p2_read_receipt_authority($1::text)",
} as const;

/** The only statements the worker store can issue. */
export const WORKER_STATEMENTS = {
  recordFirstForecastLock:
    "select created, record_id from p2_record_first_forecast_lock($1::jsonb)",
  appendSourceRevision:
    "select created, record_id from p2_append_source_revision($1::jsonb)",
  appendEvidenceState:
    "select created, record_id from p2_append_evidence_state($1::jsonb)",
  appendPublicationReceipt:
    "select created, record_id from p2_append_publication_receipt($1::jsonb)",
  readRegistryEntryStatus:
    "select * from p2_read_registry_entry_status($1::text)",
  readCohortStatus: "select * from p2_read_cohort_status($1::text)",
  readSourceRevisionsAsOf:
    "select * from p2_read_source_revisions_as_of($1::text, $2::timestamptz)",
  readEvidenceState: "select * from p2_read_evidence_state($1::text)",
  readReceiptAuthority: "select * from p2_read_receipt_authority($1::text)",
} as const;

interface AppendRow extends Record<string, unknown> {
  readonly created: boolean;
  readonly record_id: string;
}

async function append(
  client: LedgerSqlClient,
  statement: string,
  parameters: readonly unknown[],
): Promise<AppendResult> {
  // Bound as objects: the driver serializes them for the jsonb parameter.
  const { rows } = await client.query<AppendRow>(statement, parameters);
  const row = rows[0];
  if (rows.length !== 1 || !row || typeof row.created !== "boolean") {
    throw new EvidenceLabError(
      "VALIDATION",
      "append procedure returned an unexpected result",
    );
  }
  return { created: row.created, id: row.record_id };
}

async function read<Row extends Record<string, unknown>>(
  client: LedgerSqlClient,
  statement: string,
  parameters: readonly unknown[],
): Promise<readonly Row[]> {
  const { rows } = await client.query<Row>(statement, parameters);
  return rows;
}

/**
 * Operator-role data access. Constructed only from the operator connection;
 * it cannot reach worker procedures, and the database would refuse them.
 */
export class EvidenceLabOperatorStore {
  constructor(private readonly client: LedgerSqlClient) {}

  async appendRegistryEntry(
    entry: unknown,
    audit: unknown,
  ): Promise<AppendResult> {
    return append(this.client, OPERATOR_STATEMENTS.appendRegistryEntry, [
      parseSealed("registry_entry", registryEntryFieldsSchema, entry),
      parseSealed("operator_audit_event", operatorAuditFieldsSchema, audit),
    ]);
  }

  async appendRegistryEvent(
    event: unknown,
    audit: unknown,
  ): Promise<AppendResult> {
    return append(this.client, OPERATOR_STATEMENTS.appendRegistryEvent, [
      parseSealed("registry_event", registryEventFieldsSchema, event),
      parseSealed("operator_audit_event", operatorAuditFieldsSchema, audit),
    ]);
  }

  async appendCohort(cohort: unknown, audit: unknown): Promise<AppendResult> {
    return append(this.client, OPERATOR_STATEMENTS.appendCohort, [
      parseSealed("cohort", cohortFieldsSchema, cohort),
      parseSealed("operator_audit_event", operatorAuditFieldsSchema, audit),
    ]);
  }

  async appendCohortEvent(
    event: unknown,
    audit: unknown,
  ): Promise<AppendResult> {
    return append(this.client, OPERATOR_STATEMENTS.appendCohortEvent, [
      parseSealed("cohort_event", cohortEventFieldsSchema, event),
      parseSealed("operator_audit_event", operatorAuditFieldsSchema, audit),
    ]);
  }

  async appendRejectedCommand(audit: unknown): Promise<AppendResult> {
    return append(this.client, OPERATOR_STATEMENTS.appendRejectedCommand, [
      parseSealed("operator_audit_event", operatorAuditFieldsSchema, audit),
    ]);
  }

  readRegistryEntryStatus(entryId: string) {
    return read(this.client, OPERATOR_STATEMENTS.readRegistryEntryStatus, [
      entryId,
    ]);
  }

  readCohortStatus(cohortId: string) {
    return read(this.client, OPERATOR_STATEMENTS.readCohortStatus, [cohortId]);
  }

  readReceiptAuthority(batchId: string) {
    return read(this.client, OPERATOR_STATEMENTS.readReceiptAuthority, [
      batchId,
    ]);
  }
}

/** Worker-role data access: point-in-time evidence and receipt observations. */
export class EvidenceLabWorkerStore {
  constructor(private readonly client: LedgerSqlClient) {}

  async recordFirstForecastLock(lock: unknown): Promise<AppendResult> {
    return append(this.client, WORKER_STATEMENTS.recordFirstForecastLock, [
      parseSealed("cohort_forecast_lock", cohortForecastLockFieldsSchema, lock),
    ]);
  }

  async appendSourceRevision(source: unknown): Promise<AppendResult> {
    return append(this.client, WORKER_STATEMENTS.appendSourceRevision, [
      parseSealed("source_revision", sourceRevisionFieldsSchema, source),
    ]);
  }

  async appendEvidenceState(state: unknown): Promise<AppendResult> {
    return append(this.client, WORKER_STATEMENTS.appendEvidenceState, [
      parseSealed("evidence_state", evidenceStateFieldsSchema, state),
    ]);
  }

  async appendPublicationReceipt(receipt: unknown): Promise<AppendResult> {
    return append(this.client, WORKER_STATEMENTS.appendPublicationReceipt, [
      parseSealed(
        "publication_receipt",
        receiptObservationFieldsSchema,
        receipt,
      ),
    ]);
  }

  readRegistryEntryStatus(entryId: string) {
    return read(this.client, WORKER_STATEMENTS.readRegistryEntryStatus, [
      entryId,
    ]);
  }

  readCohortStatus(cohortId: string) {
    return read(this.client, WORKER_STATEMENTS.readCohortStatus, [cohortId]);
  }

  readSourceRevisionsAsOf(sourceId: string, asOf: string) {
    return read(this.client, WORKER_STATEMENTS.readSourceRevisionsAsOf, [
      sourceId,
      asOf,
    ]);
  }

  readEvidenceState(stateId: string) {
    return read(this.client, WORKER_STATEMENTS.readEvidenceState, [stateId]);
  }

  readReceiptAuthority(batchId: string) {
    return read(this.client, WORKER_STATEMENTS.readReceiptAuthority, [batchId]);
  }
}
