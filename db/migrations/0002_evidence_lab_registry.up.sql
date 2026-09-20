BEGIN;

CREATE TABLE p2_registry_entries (
  id text PRIMARY KEY CHECK (id <> ''),
  kind text NOT NULL CHECK (kind IN (
    'PACK', 'FEATURE', 'PROMPT', 'MODEL', 'POLICY', 'EXECUTION',
    'OUTCOME', 'BASELINE', 'METRIC', 'COHORT'
  )),
  version text NOT NULL CHECK (version <> ''),
  payload jsonb NOT NULL,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (kind, version, content_hash)
);

CREATE TABLE p2_registry_events (
  id text PRIMARY KEY CHECK (id <> ''),
  registry_entry_id text NOT NULL REFERENCES p2_registry_entries(id),
  event_type text NOT NULL CHECK (event_type IN ('DRAFT', 'VALIDATED', 'APPROVED', 'RETIRED')),
  reason text,
  effective_at timestamptz NOT NULL,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((event_type IN ('DRAFT', 'VALIDATED', 'APPROVED') AND reason IS NULL) OR (event_type = 'RETIRED' AND reason <> ''))
);

CREATE INDEX p2_registry_events_timeline_idx
  ON p2_registry_events (registry_entry_id, effective_at, created_at, id);

CREATE TABLE p2_cohorts (
  id text PRIMARY KEY CHECK (id <> ''),
  pack text NOT NULL CHECK (pack IN ('scalping', 'day', 'swing', 'long-term')),
  mode text NOT NULL CHECK (mode IN ('fixture', 'replay', 'prospective')),
  version_tuple jsonb NOT NULL,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (jsonb_typeof(version_tuple) = 'object')
);

CREATE TABLE p2_cohort_events (
  id text PRIMARY KEY CHECK (id <> ''),
  cohort_id text NOT NULL REFERENCES p2_cohorts(id),
  event_type text NOT NULL CHECK (event_type IN (
    'VALIDATED', 'APPROVED', 'ACTIVE', 'PAUSED', 'CLOSED', 'CORRECTION', 'FORECAST_LOCKED'
  )),
  predecessor_event_id text REFERENCES p2_cohort_events(id),
  effective_at timestamptz NOT NULL,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((event_type = 'CORRECTION') = (predecessor_event_id IS NOT NULL))
);

CREATE INDEX p2_cohort_events_timeline_idx
  ON p2_cohort_events (cohort_id, effective_at, created_at, id);
CREATE UNIQUE INDEX p2_cohort_one_forecast_lock_idx
  ON p2_cohort_events (cohort_id) WHERE event_type = 'FORECAST_LOCKED';

CREATE TABLE p2_source_revisions (
  id text PRIMARY KEY CHECK (id <> ''),
  source_id text NOT NULL CHECK (source_id <> ''),
  revision text NOT NULL CHECK (revision <> ''),
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  published_at timestamptz NOT NULL,
  effective_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  correction_at timestamptz,
  supersedes_source_revision_id text REFERENCES p2_source_revisions(id),
  disclosure_class text NOT NULL CHECK (disclosure_class IN ('PUBLIC', 'PROTECTED', 'LICENSED')),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_id, revision, source_hash),
  CHECK (available_at >= published_at),
  CHECK ((correction_at IS NULL) = (supersedes_source_revision_id IS NULL))
);

CREATE INDEX p2_source_revisions_available_idx
  ON p2_source_revisions (source_id, available_at, id);

CREATE TABLE p2_evidence_states (
  id text PRIMARY KEY CHECK (id <> ''),
  pack text NOT NULL CHECK (pack IN ('scalping', 'day', 'swing', 'long-term')),
  cutoff_at timestamptz NOT NULL,
  source_revision_ids jsonb NOT NULL CHECK (jsonb_typeof(source_revision_ids) = 'array' AND jsonb_array_length(source_revision_ids) > 0),
  admission_manifest_hash char(64) NOT NULL CHECK (admission_manifest_hash ~ '^[a-f0-9]{64}$'),
  normalized_state jsonb NOT NULL,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX p2_evidence_states_cutoff_idx
  ON p2_evidence_states (pack, cutoff_at, id);

CREATE TABLE p2_operator_audit_events (
  id text PRIMARY KEY CHECK (id <> ''),
  command text NOT NULL CHECK (command <> ''),
  actor_fingerprint char(64) NOT NULL CHECK (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  target_id text,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE p2_publication_receipts (
  id text PRIMARY KEY CHECK (id <> ''),
  batch_id text NOT NULL CHECK (batch_id <> ''),
  sink text NOT NULL CHECK (sink <> ''),
  root_hash char(64) NOT NULL CHECK (root_hash ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('TIMELY', 'LATE', 'MISSING', 'FAILED')),
  receipt_payload_hash char(64) NOT NULL CHECK (receipt_payload_hash ~ '^[a-f0-9]{64}$'),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (batch_id, root_hash),
  CHECK (received_at >= submitted_at),
  CHECK ((status = 'TIMELY') = (submitted_at <= deadline_at AND received_at <= deadline_at))
);

CREATE INDEX p2_publication_receipts_deadline_idx
  ON p2_publication_receipts (deadline_at, batch_id);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'p2_registry_entries', 'p2_registry_events', 'p2_cohorts',
    'p2_cohort_events', 'p2_source_revisions', 'p2_evidence_states',
    'p2_operator_audit_events', 'p2_publication_receipts'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_mutation()',
      table_name, table_name
    );
  END LOOP;
END
$$;

CREATE FUNCTION p2_verify_content_hash(
  p_kind text,
  p_input jsonb,
  p_canonical_payload text,
  p_content_hash text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  decoded jsonb;
  actual_hash text;
BEGIN
  IF NULLIF(p_canonical_payload, '') IS NULL THEN
    RAISE EXCEPTION 'canonical payload is required';
  END IF;
  BEGIN
    decoded := p_canonical_payload::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'canonical payload must be valid JSON';
  END;
  IF decoded IS DISTINCT FROM jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1',
    'kind', p_kind,
    'payload', p_input - ARRAY['canonicalPayload', 'contentHash']
  ) THEN
    RAISE EXCEPTION 'canonical payload does not match immutable fields';
  END IF;
  actual_hash := encode(digest(convert_to(p_canonical_payload, 'UTF8'), 'sha256'), 'hex');
  IF actual_hash IS DISTINCT FROM p_content_hash THEN
    RAISE EXCEPTION 'content hash does not match canonical payload';
  END IF;
END
$$;

CREATE FUNCTION p2_validate_registry_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  previous_type text;
BEGIN
  SELECT event_type INTO previous_type
  FROM p2_registry_events
  WHERE registry_entry_id = NEW.registry_entry_id
  ORDER BY effective_at DESC, created_at DESC, id DESC
  LIMIT 1;
  IF previous_type IS NULL AND NEW.event_type <> 'DRAFT' THEN
    RAISE EXCEPTION 'registry entry must begin DRAFT';
  ELSIF previous_type = 'DRAFT' AND NEW.event_type <> 'VALIDATED' THEN
    RAISE EXCEPTION 'registry entry may only advance DRAFT to VALIDATED';
  ELSIF previous_type = 'VALIDATED' AND NEW.event_type <> 'APPROVED' THEN
    RAISE EXCEPTION 'registry entry may only advance VALIDATED to APPROVED';
  ELSIF previous_type = 'APPROVED' AND NEW.event_type <> 'RETIRED' THEN
    RAISE EXCEPTION 'registry entry may only advance APPROVED to RETIRED';
  ELSIF previous_type = 'RETIRED' THEN
    RAISE EXCEPTION 'retired registry entry is terminal';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_registry_event_lifecycle
  BEFORE INSERT ON p2_registry_events
  FOR EACH ROW EXECUTE FUNCTION p2_validate_registry_event();

CREATE FUNCTION p2_validate_cohort_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  previous_type text;
  predecessor_cohort_id text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM p2_cohort_events
    WHERE cohort_id = NEW.cohort_id AND event_type = 'FORECAST_LOCKED'
  ) AND NEW.event_type <> 'CORRECTION' THEN
    RAISE EXCEPTION 'cohort methodology is locked after its first forecast';
  END IF;
  IF NEW.event_type = 'ACTIVE' AND NEW.effective_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'cohort activation must be future-dated';
  END IF;
  IF NEW.event_type = 'CORRECTION' THEN
    SELECT cohort_id INTO predecessor_cohort_id
      FROM p2_cohort_events WHERE id = NEW.predecessor_event_id;
    IF predecessor_cohort_id IS DISTINCT FROM NEW.cohort_id THEN
      RAISE EXCEPTION 'cohort correction must link an event in the same cohort';
    END IF;
    RETURN NEW;
  END IF;
  SELECT event_type INTO previous_type
  FROM p2_cohort_events WHERE cohort_id = NEW.cohort_id
  ORDER BY effective_at DESC, created_at DESC, id DESC LIMIT 1;
  IF NEW.event_type = 'FORECAST_LOCKED' THEN
    IF previous_type IS NULL THEN
      RAISE EXCEPTION 'cohort cannot lock before a lifecycle event';
    END IF;
  ELSIF previous_type IS NULL AND NEW.event_type <> 'VALIDATED' THEN
    RAISE EXCEPTION 'cohort must begin VALIDATED';
  ELSIF previous_type = 'VALIDATED' AND NEW.event_type <> 'APPROVED' THEN
    RAISE EXCEPTION 'cohort may only advance VALIDATED to APPROVED';
  ELSIF previous_type = 'APPROVED' AND NEW.event_type NOT IN ('ACTIVE', 'PAUSED', 'CLOSED') THEN
    RAISE EXCEPTION 'invalid cohort transition from APPROVED';
  ELSIF previous_type = 'ACTIVE' AND NEW.event_type NOT IN ('PAUSED', 'CLOSED') THEN
    RAISE EXCEPTION 'invalid cohort transition from ACTIVE';
  ELSIF previous_type = 'PAUSED' AND NEW.event_type NOT IN ('ACTIVE', 'CLOSED') THEN
    RAISE EXCEPTION 'invalid cohort transition from PAUSED';
  ELSIF previous_type = 'CLOSED' THEN
    RAISE EXCEPTION 'closed cohort is terminal';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_cohort_event_lifecycle
  BEFORE INSERT ON p2_cohort_events
  FOR EACH ROW EXECUTE FUNCTION p2_validate_cohort_event();

CREATE FUNCTION p2_validate_source_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  predecessor_source_id text;
BEGIN
  IF NEW.supersedes_source_revision_id IS NOT NULL THEN
    SELECT source_id INTO predecessor_source_id
      FROM p2_source_revisions WHERE id = NEW.supersedes_source_revision_id;
    IF predecessor_source_id IS DISTINCT FROM NEW.source_id THEN
      RAISE EXCEPTION 'source correction must retain source identity';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_source_revision_chain
  BEFORE INSERT ON p2_source_revisions
  FOR EACH ROW EXECUTE FUNCTION p2_validate_source_revision();

CREATE FUNCTION p2_validate_evidence_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW.source_revision_ids) AS referenced(id)
    LEFT JOIN p2_source_revisions source ON source.id = referenced.id
    WHERE source.id IS NULL OR source.available_at > NEW.cutoff_at
  ) THEN
    RAISE EXCEPTION 'evidence state includes an unknown or late source revision';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_evidence_state_source_cutoff
  BEFORE INSERT ON p2_evidence_states
  FOR EACH ROW EXECUTE FUNCTION p2_validate_evidence_state();

CREATE FUNCTION p2_append_registry_entry(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('registry_entry', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_registry_entries (id, kind, version, payload, canonical_payload, content_hash)
  VALUES (p_input->>'id', p_input->>'kind', p_input->>'version', p_input->'payload', p_input->>'canonicalPayload', p_input->>'contentHash')
  ON CONFLICT (id) DO NOTHING;
  IF EXISTS (SELECT 1 FROM p2_registry_entries WHERE id = p_input->>'id' AND content_hash <> p_input->>'contentHash') THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'registry entry conflicts with a different immutable payload';
  END IF;
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_append_registry_event(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('registry_event', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_registry_events (id, registry_entry_id, event_type, reason, effective_at, canonical_payload, content_hash)
  VALUES (p_input->>'id', p_input->>'registryEntryId', p_input->>'type', p_input->>'reason', (p_input->>'effectiveAt')::timestamptz, p_input->>'canonicalPayload', p_input->>'contentHash');
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_append_cohort(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('cohort', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_cohorts (id, pack, mode, version_tuple, canonical_payload, content_hash)
  VALUES (p_input->>'id', p_input->>'pack', p_input->>'mode', p_input->'versions', p_input->>'canonicalPayload', p_input->>'contentHash');
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_append_cohort_event(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('cohort_event', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_cohort_events (id, cohort_id, event_type, predecessor_event_id, effective_at, canonical_payload, content_hash)
  VALUES (p_input->>'id', p_input->>'cohortId', p_input->>'type', p_input->>'predecessorEventId', (p_input->>'effectiveAt')::timestamptz, p_input->>'canonicalPayload', p_input->>'contentHash');
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_append_source_revision(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('source_revision', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_source_revisions (
    id, source_id, revision, source_hash, payload_hash, published_at, effective_at,
    ingested_at, available_at, correction_at, supersedes_source_revision_id,
    disclosure_class, canonical_payload, content_hash
  ) VALUES (
    p_input->>'id', p_input->>'sourceId', p_input->>'revision', p_input->>'sourceHash', p_input->>'payloadHash',
    (p_input->>'publishedAt')::timestamptz, (p_input->>'effectiveAt')::timestamptz,
    (p_input->>'ingestedAt')::timestamptz, (p_input->>'availableAt')::timestamptz,
    (p_input->>'correctionAt')::timestamptz, p_input->>'supersedesSourceRevisionId',
    p_input->>'disclosureClass', p_input->>'canonicalPayload', p_input->>'contentHash'
  );
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_append_evidence_state(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('evidence_state', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_evidence_states (
    id, pack, cutoff_at, source_revision_ids, admission_manifest_hash,
    normalized_state, canonical_payload, content_hash
  ) VALUES (
    p_input->>'id', p_input->>'pack', (p_input->>'cutoffAt')::timestamptz,
    p_input->'sourceRevisionIds', p_input->>'admissionManifestHash',
    p_input->'normalizedState', p_input->>'canonicalPayload', p_input->>'contentHash
  );
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_append_operator_audit_event(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('operator_audit_event', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_operator_audit_events (id, command, actor_fingerprint, request_hash, target_id, canonical_payload, content_hash)
  VALUES (p_input->>'id', p_input->>'command', p_input->>'actorFingerprint', p_input->>'requestHash', p_input->>'targetId', p_input->>'canonicalPayload', p_input->>'contentHash');
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_append_publication_receipt(p_input jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM p2_verify_content_hash('publication_receipt', p_input, p_input->>'canonicalPayload', p_input->>'contentHash');
  INSERT INTO p2_publication_receipts (
    id, batch_id, sink, root_hash, submitted_at, received_at, deadline_at, status,
    receipt_payload_hash, canonical_payload, content_hash
  ) VALUES (
    p_input->>'id', p_input->>'batchId', p_input->>'sink', p_input->>'rootHash',
    (p_input->>'submittedAt')::timestamptz, (p_input->>'receivedAt')::timestamptz,
    (p_input->>'deadlineAt')::timestamptz, p_input->>'status', p_input->>'receiptPayloadHash',
    p_input->>'canonicalPayload', p_input->>'contentHash'
  );
  RETURN p_input->>'id';
END $$;

CREATE FUNCTION p2_read_evidence_state(p_evidence_state_id text)
RETURNS TABLE (id text, pack text, cutoff_at timestamptz, content_hash char(64))
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT state.id, state.pack, state.cutoff_at, state.content_hash
  FROM p2_evidence_states state
  WHERE state.id = p_evidence_state_id
$$;

CREATE VIEW p2_public_evidence_projection
WITH (security_barrier = true)
AS
SELECT state.id, state.pack, state.cutoff_at, state.content_hash
FROM p2_evidence_states state
WHERE false;

REVOKE ALL ON TABLE
  p2_registry_entries, p2_registry_events, p2_cohorts, p2_cohort_events,
  p2_source_revisions, p2_evidence_states, p2_operator_audit_events,
  p2_publication_receipts, p2_public_evidence_projection
FROM PUBLIC, jev_public_reader, jev_public_ingest, jev_worker, jev_operator;

REVOKE ALL ON FUNCTION p2_verify_content_hash(text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_registry_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_cohort_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_source_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_evidence_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_registry_entry(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_registry_event(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_cohort(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_cohort_event(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_source_revision(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_evidence_state(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_operator_audit_event(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_publication_receipt(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_read_evidence_state(text) FROM PUBLIC;

GRANT SELECT ON p2_public_evidence_projection TO jev_public_reader;
GRANT EXECUTE ON FUNCTION p2_append_source_revision(jsonb) TO jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_evidence_state(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_read_evidence_state(text) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_append_registry_entry(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_registry_event(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_cohort(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_cohort_event(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_operator_audit_event(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_publication_receipt(jsonb) TO jev_operator;

COMMIT;
