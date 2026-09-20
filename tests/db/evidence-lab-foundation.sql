\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT has_table_privilege('jev_public_reader', 'p2_public_evidence_projection', 'SELECT')
    OR has_table_privilege('jev_public_reader', 'p2_evidence_states', 'SELECT')
    OR has_table_privilege('jev_worker', 'p2_evidence_states', 'INSERT')
    OR has_table_privilege('jev_operator', 'p2_registry_entries', 'INSERT')
    OR has_function_privilege('jev_public_ingest', 'p2_append_source_revision(jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('jev_worker', 'p2_append_evidence_state(jsonb)', 'EXECUTE')
    OR has_function_privilege('jev_worker', 'p2_append_registry_entry(jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('jev_operator', 'p2_append_publication_receipt(jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Evidence Lab procedure and projection role matrix is incorrect';
  END IF;
END
$$;

DO $$
DECLARE
  source_base jsonb;
  source_input jsonb;
  source_canonical text;
  evidence_base jsonb;
  evidence_input jsonb;
  evidence_canonical text;
BEGIN
  source_base := jsonb_build_object(
    'id', 'p2_source_01', 'sourceId', 'fixture:day:AAPL', 'revision', 'v1',
    'sourceHash', repeat('a', 64), 'payloadHash', repeat('b', 64),
    'publishedAt', '2026-09-20T08:00:00.000Z', 'effectiveAt', '2026-09-20T08:01:00.000Z',
    'ingestedAt', '2026-09-20T08:02:00.000Z', 'availableAt', '2026-09-20T09:00:00.001Z',
    'correctionAt', NULL, 'supersedesSourceRevisionId', NULL, 'disclosureClass', 'PROTECTED'
  );
  source_canonical := jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'source_revision', 'payload', source_base
  )::text;
  source_input := source_base || jsonb_build_object(
    'canonicalPayload', source_canonical,
    'contentHash', encode(digest(convert_to(source_canonical, 'UTF8'), 'sha256'), 'hex')
  );

  SET LOCAL ROLE jev_worker;
  PERFORM p2_append_source_revision(source_input);

  evidence_base := jsonb_build_object(
    'id', 'p2_evidence_late', 'pack', 'day', 'cutoffAt', '2026-09-20T09:00:00.000Z',
    'sourceRevisionIds', jsonb_build_array('p2_source_01'), 'admissionManifestHash', repeat('c', 64),
    'normalizedState', jsonb_build_object('fixture', true)
  );
  evidence_canonical := jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'evidence_state', 'payload', evidence_base
  )::text;
  evidence_input := evidence_base || jsonb_build_object(
    'canonicalPayload', evidence_canonical,
    'contentHash', encode(digest(convert_to(evidence_canonical, 'UTF8'), 'sha256'), 'hex')
  );
  BEGIN
    PERFORM p2_append_evidence_state(evidence_input);
    RAISE EXCEPTION 'late source admission must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'late source admission must fail' THEN RAISE; END IF;
  END;
END
$$;

DO $$
DECLARE
  cohort_base jsonb;
  cohort_input jsonb;
  canonical text;
  validated_event_base jsonb;
  validated_event jsonb;
  lock_event_base jsonb;
  lock_event jsonb;
  paused_event_base jsonb;
  paused_event jsonb;
  correction_base jsonb;
  correction_input jsonb;
BEGIN
  cohort_base := jsonb_build_object(
    'id', 'p2_cohort_01', 'pack', 'day', 'mode', 'fixture', 'status', 'DRAFT',
    'versions', jsonb_build_object(
      'packProfile', 'pack-v1', 'model', 'model-v1', 'prompt', 'prompt-v1',
      'feature', 'feature-v1', 'policy', 'policy-v1', 'execution', 'execution-v1', 'costScenario', 'cost-v1',
      'outcome', 'outcome-v1', 'baseline', 'baseline-v1', 'metric', 'metric-v1', 'build', 'build-v1'
    )
  );
  canonical := jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'cohort', 'payload', cohort_base
  )::text;
  cohort_input := cohort_base || jsonb_build_object(
    'canonicalPayload', canonical,
    'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  );

  SET LOCAL ROLE jev_operator;
  PERFORM p2_append_cohort(cohort_input);

  validated_event_base := jsonb_build_object(
    'id', 'p2_cohort_event_01', 'cohortId', 'p2_cohort_01', 'type', 'VALIDATED',
    'predecessorEventId', NULL, 'effectiveAt', '2026-09-20T09:01:00.000Z'
  );
  canonical := jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'cohort_event', 'payload', validated_event_base
  )::text;
  validated_event := validated_event_base || jsonb_build_object(
    'canonicalPayload', canonical, 'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  );
  PERFORM p2_append_cohort_event(validated_event);

  lock_event_base := jsonb_build_object(
    'id', 'p2_cohort_event_02', 'cohortId', 'p2_cohort_01', 'type', 'FORECAST_LOCKED',
    'predecessorEventId', NULL, 'effectiveAt', '2026-09-20T09:02:00.000Z'
  );
  canonical := jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'cohort_event', 'payload', lock_event_base
  )::text;
  lock_event := lock_event_base || jsonb_build_object(
    'canonicalPayload', canonical, 'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  );
  PERFORM p2_append_cohort_event(lock_event);

  paused_event_base := jsonb_build_object(
    'id', 'p2_cohort_event_03', 'cohortId', 'p2_cohort_01', 'type', 'PAUSED',
    'predecessorEventId', NULL, 'effectiveAt', '2026-09-20T09:03:00.000Z'
  );
  canonical := jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'cohort_event', 'payload', paused_event_base
  )::text;
  paused_event := paused_event_base || jsonb_build_object(
    'canonicalPayload', canonical, 'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  );
  BEGIN
    PERFORM p2_append_cohort_event(paused_event);
    RAISE EXCEPTION 'cohort mutation after first forecast must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cohort mutation after first forecast must fail' THEN RAISE; END IF;
  END;

  correction_base := jsonb_build_object(
    'id', 'p2_source_02', 'sourceId', 'fixture:day:AAPL', 'revision', 'v2',
    'sourceHash', repeat('d', 64), 'payloadHash', repeat('e', 64),
    'publishedAt', '2026-09-20T08:00:00.000Z', 'effectiveAt', '2026-09-20T08:01:00.000Z',
    'ingestedAt', '2026-09-20T08:02:00.000Z', 'availableAt', '2026-09-20T08:03:00.000Z',
    'correctionAt', '2026-09-20T09:04:00.000Z', 'supersedesSourceRevisionId', 'p2_source_01',
    'disclosureClass', 'PROTECTED'
  );
  canonical := jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'source_revision', 'payload', correction_base
  )::text;
  correction_input := correction_base || jsonb_build_object(
    'canonicalPayload', canonical, 'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  );
  PERFORM p2_append_source_revision(correction_input);
  IF (SELECT count(*) FROM p2_source_revisions WHERE source_id = 'fixture:day:AAPL') <> 2 THEN
    RAISE EXCEPTION 'source correction must append rather than mutate';
  END IF;
END
$$;

DO $$
BEGIN
  SET LOCAL ROLE jev_operator;
  BEGIN
    UPDATE p2_source_revisions SET revision = 'rewritten' WHERE id = 'p2_source_01';
    RAISE EXCEPTION 'runtime evidence mutation must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'runtime evidence mutation must fail' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM p2_source_revisions WHERE id = 'p2_source_01';
    RAISE EXCEPTION 'runtime evidence deletion must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'runtime evidence deletion must fail' THEN RAISE; END IF;
  END;
  BEGIN
    GRANT SELECT ON p2_source_revisions TO jev_operator;
    RAISE EXCEPTION 'runtime grant must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'runtime grant must fail' THEN RAISE; END IF;
  END;
END
$$;
