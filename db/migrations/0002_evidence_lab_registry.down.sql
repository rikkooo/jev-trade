BEGIN;

-- Disposable-schema development only; never part of `pnpm db:migrate`.
--
-- Rollback policy (plan: Runtime, Rollout, and Rollback): the Phase Two schema
-- may be removed only before any evidence is written. Once a single Phase Two
-- row exists, recovery is forward-only: pause scheduling, stop publication,
-- serve the last validated projection, and repair with a new migration.
DO $$
DECLARE
  table_name text;
  has_rows boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'p2_operator_audit_events', 'p2_registry_entries', 'p2_registry_events',
    'p2_cohorts', 'p2_cohort_registry_refs', 'p2_cohort_events',
    'p2_source_revisions', 'p2_evidence_states', 'p2_evidence_state_admissions',
    'p2_publication_receipts'
  ]
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', table_name) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          'refusing to drop Phase Two schema: %s holds evidence; recovery is forward-only',
          table_name
        );
    END IF;
  END LOOP;
END
$$;

DROP FUNCTION p2_read_receipt_authority(text);
DROP FUNCTION p2_read_evidence_state(text);
DROP FUNCTION p2_read_source_revisions_as_of(text, timestamptz);
DROP FUNCTION p2_read_cohort_status(text);
DROP FUNCTION p2_read_registry_entry_status(text);
DROP FUNCTION p2_append_publication_receipt(jsonb);
DROP FUNCTION p2_append_evidence_state(jsonb);
DROP FUNCTION p2_append_source_revision(jsonb);
DROP FUNCTION p2_record_first_forecast_lock(jsonb);
DROP FUNCTION p2_append_rejected_operator_command(jsonb);
DROP FUNCTION p2_append_cohort_event(jsonb, jsonb);
DROP FUNCTION p2_append_cohort(jsonb, jsonb);
DROP FUNCTION p2_append_registry_event(jsonb, jsonb);
DROP FUNCTION p2_append_registry_entry(jsonb, jsonb);
DROP FUNCTION p2_assert_command_replay(text, text, jsonb, jsonb);
DROP FUNCTION p2_accept_operator_command(jsonb, text, text, text, text);
-- Returns the p2_cohort_events row type, so it must go before the table.
DROP FUNCTION p2_cohort_status(text, timestamptz);
DROP FUNCTION p2_cohort_lifecycle_event(text);

DROP TABLE p2_publication_receipts;
DROP TABLE p2_evidence_state_admissions;
DROP TABLE p2_evidence_states;
DROP TABLE p2_source_revisions;
DROP TABLE p2_cohort_events;
DROP TABLE p2_cohort_registry_refs;
DROP TABLE p2_cohorts;
DROP TABLE p2_registry_events;
DROP TABLE p2_registry_entries;
DROP TABLE p2_operator_audit_events;

DROP FUNCTION p2_validate_publication_receipt();
DROP FUNCTION p2_check_evidence_state_complete();
DROP FUNCTION p2_assert_evidence_state_complete(text);
DROP FUNCTION p2_validate_evidence_admission();
DROP FUNCTION p2_validate_evidence_state();
DROP FUNCTION p2_validate_source_revision();
DROP FUNCTION p2_validate_cohort_event();
DROP FUNCTION p2_check_cohort_complete();
DROP FUNCTION p2_assert_cohort_complete(text);
DROP FUNCTION p2_validate_cohort();
DROP FUNCTION p2_validate_registry_event();
DROP FUNCTION p2_validate_registry_entry();
DROP FUNCTION p2_admission_manifest_hash(text);
DROP FUNCTION p2_registry_root_hash(text);
DROP FUNCTION p2_registry_entry_status(text);
DROP FUNCTION p2_command_request_hash(text, text, text, text);
DROP FUNCTION p2_verify_envelope(text, jsonb);
DROP FUNCTION p2_integer(jsonb, text, integer);
DROP FUNCTION p2_timestamp(jsonb, text, boolean);
DROP FUNCTION p2_text(jsonb, text, text, boolean);
DROP FUNCTION p2_assert_keys(text, jsonb, text[]);
DROP FUNCTION p2_invalid(text);
DROP FUNCTION p2_sha256_hex(text);
DROP FUNCTION p2_canonical_json(jsonb);

DELETE FROM public.schema_migrations WHERE version = '0002_evidence_lab_registry';

COMMIT;
