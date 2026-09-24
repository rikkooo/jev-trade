BEGIN;

-- Phase Two Evidence Lab foundation (#15 / U5).
--
-- Additive to the v0.1 ledger: no v0.1 object is altered. Every Phase Two row
-- is append-only, content-addressed with the canonical JSON envelope
-- `jev-evidence-lab-canonical-json/v1`, and written only through named
-- SECURITY DEFINER procedures. Runtime roles receive no direct relation
-- privilege. Prospective activation, prospective evidence states, and receipt
-- authority are structurally unavailable in this schema version; the later
-- readiness (#26), data-rights (#14), and timestamp-sink (#30) migrations own
-- those gates.

-- SQLSTATE contract: 22023 invalid input; 23505 conflicting immutable record
-- or idempotency key; 23503 missing reference; 55000 illegal transition,
-- immutable lock, or UPDATE/DELETE/TRUNCATE attempt; 42501 role denial; and
-- JTG01 a capability held closed by a Phase Two gate.

-- ---------------------------------------------------------------------------
-- Canonical serialization and input helpers (internal; never granted)
-- ---------------------------------------------------------------------------

CREATE FUNCTION p2_canonical_json(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  result text;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(
        to_json(entry.key)::text || ':' || p2_canonical_json(entry.value),
        ',' ORDER BY entry.key COLLATE "C"
      ), '') || '}'
      INTO result
      FROM jsonb_each(p_value) AS entry;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(
        p2_canonical_json(element.value), ',' ORDER BY element.position
      ), '') || ']'
      INTO result
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS element(value, position);
    WHEN 'string' THEN
      result := to_json(p_value #>> '{}')::text;
    ELSE
      result := p_value::text;
  END CASE;
  RETURN result;
END
$$;

CREATE FUNCTION p2_sha256_hex(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT encode(sha256(convert_to(p_text, 'UTF8')), 'hex')
$$;

CREATE FUNCTION p2_invalid(p_message text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = p_message;
END
$$;

CREATE FUNCTION p2_assert_keys(p_label text, p_value jsonb, p_keys text[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  missing text[];
  unknown text[];
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN
    PERFORM p2_invalid(format('%s must be a JSON object', p_label));
  END IF;
  SELECT array_agg(required.key ORDER BY required.key)
  INTO missing
  FROM unnest(p_keys) AS required(key)
  WHERE NOT p_value ? required.key;
  IF missing IS NOT NULL THEN
    PERFORM p2_invalid(format('%s is missing fields %s', p_label, missing));
  END IF;
  SELECT array_agg(present.key ORDER BY present.key)
  INTO unknown
  FROM jsonb_object_keys(p_value) AS present(key)
  WHERE present.key <> ALL (p_keys);
  IF unknown IS NOT NULL THEN
    PERFORM p2_invalid(format('%s has unknown fields %s', p_label, unknown));
  END IF;
END
$$;

CREATE FUNCTION p2_text(
  p_value jsonb,
  p_key text,
  p_pattern text,
  p_nullable boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  field jsonb := p_value -> p_key;
BEGIN
  IF field IS NULL OR field = 'null'::jsonb THEN
    IF p_nullable THEN RETURN NULL; END IF;
    PERFORM p2_invalid(format('%s is required', p_key));
  END IF;
  IF jsonb_typeof(field) <> 'string' OR NOT ((field #>> '{}') ~ p_pattern) THEN
    PERFORM p2_invalid(format('%s has an invalid value', p_key));
  END IF;
  RETURN field #>> '{}';
END
$$;

CREATE FUNCTION p2_timestamp(
  p_value jsonb,
  p_key text,
  p_nullable boolean DEFAULT false
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  raw text := p2_text(
    p_value, p_key,
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$',
    p_nullable
  );
  parsed timestamptz;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  BEGIN
    parsed := raw::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    PERFORM p2_invalid(format('%s is not a valid timestamp', p_key));
  END;
  IF to_char(parsed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> raw THEN
    PERFORM p2_invalid(format('%s is not a canonical UTC timestamp', p_key));
  END IF;
  RETURN parsed;
END
$$;

CREATE FUNCTION p2_integer(p_value jsonb, p_key text, p_minimum integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  field jsonb := p_value -> p_key;
  parsed numeric;
BEGIN
  IF field IS NULL OR jsonb_typeof(field) <> 'number' THEN
    PERFORM p2_invalid(format('%s must be an integer', p_key));
  END IF;
  parsed := (field #>> '{}')::numeric;
  IF parsed <> trunc(parsed) OR parsed < p_minimum OR parsed > 2147483647 THEN
    PERFORM p2_invalid(format('%s must be an integer of at least %s', p_key, p_minimum));
  END IF;
  RETURN parsed::integer;
END
$$;

-- Verifies the canonical envelope and returns the hashed payload.
CREATE FUNCTION p2_verify_envelope(p_kind text, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  canonical text;
  payload jsonb;
  decoded jsonb;
BEGIN
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
    PERFORM p2_invalid(format('%s input must be a JSON object', p_kind));
  END IF;
  IF jsonb_typeof(p_input -> 'canonicalPayload') IS DISTINCT FROM 'string' THEN
    PERFORM p2_invalid('canonical payload is required');
  END IF;
  IF COALESCE(p_input ->> 'contentHash', '') !~ '^[a-f0-9]{64}$' THEN
    PERFORM p2_invalid('content hash is required');
  END IF;
  canonical := p_input ->> 'canonicalPayload';
  payload := p_input - 'canonicalPayload' - 'contentHash';
  BEGIN
    decoded := canonical::jsonb;
  EXCEPTION WHEN OTHERS THEN
    PERFORM p2_invalid('canonical payload must be valid JSON');
  END;
  IF decoded IS DISTINCT FROM jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1',
    'kind', p_kind,
    'payload', payload
  ) THEN
    PERFORM p2_invalid('canonical payload does not match immutable fields');
  END IF;
  IF p2_canonical_json(decoded) IS DISTINCT FROM canonical THEN
    PERFORM p2_invalid('canonical payload is not in canonical form');
  END IF;
  IF p2_sha256_hex(canonical) IS DISTINCT FROM p_input ->> 'contentHash' THEN
    PERFORM p2_invalid('content hash does not match canonical payload');
  END IF;
  RETURN payload;
END
$$;

CREATE FUNCTION p2_command_request_hash(
  p_command text,
  p_target_kind text,
  p_target_id text,
  p_target_content_hash text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p2_sha256_hex(p2_canonical_json(jsonb_build_object(
    'recipe', 'jev-evidence-lab-command-request/v1',
    'command', p_command,
    'targetKind', p_target_kind,
    'targetId', p_target_id,
    'targetContentHash', p_target_content_hash
  )))
$$;

-- ---------------------------------------------------------------------------
-- Operator audit events
-- ---------------------------------------------------------------------------

CREATE TABLE p2_operator_audit_events (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  command text NOT NULL CHECK (command IN (
    'APPEND_REGISTRY_ENTRY', 'APPEND_REGISTRY_EVENT', 'APPEND_COHORT', 'APPEND_COHORT_EVENT'
  )),
  outcome text NOT NULL CHECK (outcome IN ('ACCEPTED', 'REJECTED')),
  rejection_code text CHECK (rejection_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  credential_class text NOT NULL CHECK (credential_class = 'OPERATOR_TOKEN'),
  actor_fingerprint char(64) NOT NULL CHECK (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  target_kind text NOT NULL CHECK (target_kind IN (
    'REGISTRY_ENTRY', 'REGISTRY_EVENT', 'COHORT', 'COHORT_EVENT'
  )),
  target_id text NOT NULL CHECK (target_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((outcome = 'REJECTED') = (rejection_code IS NOT NULL)),
  CHECK ((command, target_kind) IN (
    ('APPEND_REGISTRY_ENTRY', 'REGISTRY_ENTRY'),
    ('APPEND_REGISTRY_EVENT', 'REGISTRY_EVENT'),
    ('APPEND_COHORT', 'COHORT'),
    ('APPEND_COHORT_EVENT', 'COHORT_EVENT')
  ))
);

CREATE UNIQUE INDEX p2_operator_audit_accepted_key_idx
  ON p2_operator_audit_events (idempotency_key) WHERE outcome = 'ACCEPTED';
CREATE UNIQUE INDEX p2_operator_audit_accepted_target_idx
  ON p2_operator_audit_events (target_kind, target_id) WHERE outcome = 'ACCEPTED';
CREATE INDEX p2_operator_audit_timeline_idx
  ON p2_operator_audit_events (recorded_at, id);

-- ---------------------------------------------------------------------------
-- Methodology registry
-- ---------------------------------------------------------------------------

CREATE TABLE p2_registry_entries (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  kind text NOT NULL CHECK (kind IN (
    'PACK_PROFILE', 'FEATURE', 'PROMPT', 'MODEL', 'RISK', 'POLICY',
    'EXECUTION', 'COST_SCENARIO', 'OUTCOME', 'BASELINE', 'METRIC'
  )),
  version text NOT NULL CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$'),
  pack text CHECK (pack IN ('scalping', 'day', 'swing', 'long-term')),
  supersedes_entry_id text REFERENCES p2_registry_entries(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  audit_event_id text NOT NULL UNIQUE REFERENCES p2_operator_audit_events(id),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (kind, version),
  UNIQUE (id, kind, content_hash),
  CHECK (kind <> 'PACK_PROFILE' OR pack IS NOT NULL),
  CHECK (supersedes_entry_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX p2_registry_one_successor_idx
  ON p2_registry_entries (supersedes_entry_id) WHERE supersedes_entry_id IS NOT NULL;

CREATE TABLE p2_registry_events (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  registry_entry_id text NOT NULL REFERENCES p2_registry_entries(id),
  event_type text NOT NULL CHECK (event_type IN ('VALIDATED', 'APPROVED', 'RETIRED')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  review_reference text CHECK (review_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$'),
  audit_event_id text NOT NULL UNIQUE REFERENCES p2_operator_audit_events(id),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((event_type = 'APPROVED') = (review_reference IS NOT NULL))
);

CREATE UNIQUE INDEX p2_registry_event_once_idx
  ON p2_registry_events (registry_entry_id, event_type);

-- ---------------------------------------------------------------------------
-- Cohorts
-- ---------------------------------------------------------------------------

CREATE TABLE p2_cohorts (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  pack text NOT NULL CHECK (pack IN ('scalping', 'day', 'swing', 'long-term')),
  mode text NOT NULL CHECK (mode IN ('fixture', 'replay', 'prospective')),
  cohort_version integer NOT NULL CHECK (cohort_version BETWEEN 1 AND 100000),
  predecessor_cohort_id text REFERENCES p2_cohorts(id),
  registry_root_hash char(64) NOT NULL CHECK (registry_root_hash ~ '^[a-f0-9]{64}$'),
  methodology jsonb NOT NULL CHECK (jsonb_typeof(methodology) = 'object'),
  audit_event_id text NOT NULL UNIQUE REFERENCES p2_operator_audit_events(id),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((cohort_version = 1) = (predecessor_cohort_id IS NULL)),
  CHECK (predecessor_cohort_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX p2_cohort_one_successor_idx
  ON p2_cohorts (predecessor_cohort_id) WHERE predecessor_cohort_id IS NOT NULL;

CREATE TABLE p2_cohort_registry_refs (
  cohort_id text NOT NULL REFERENCES p2_cohorts(id),
  slot text NOT NULL,
  registry_entry_id text NOT NULL,
  registry_kind text NOT NULL,
  registry_content_hash char(64) NOT NULL,
  PRIMARY KEY (cohort_id, slot),
  FOREIGN KEY (registry_entry_id, registry_kind, registry_content_hash)
    REFERENCES p2_registry_entries (id, kind, content_hash),
  CHECK ((slot, registry_kind) IN (
    ('packProfile', 'PACK_PROFILE'), ('feature', 'FEATURE'), ('prompt', 'PROMPT'),
    ('model', 'MODEL'), ('risk', 'RISK'), ('policy', 'POLICY'),
    ('execution', 'EXECUTION'), ('costScenarios', 'COST_SCENARIO'),
    ('outcome', 'OUTCOME'), ('baseline', 'BASELINE'), ('metric', 'METRIC')
  ))
);

CREATE INDEX p2_cohort_registry_refs_entry_idx
  ON p2_cohort_registry_refs (registry_entry_id);

CREATE TABLE p2_cohort_events (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  cohort_id text NOT NULL REFERENCES p2_cohorts(id),
  event_type text NOT NULL CHECK (event_type IN (
    'VALIDATED', 'APPROVED', 'ACTIVATION_SCHEDULED', 'PAUSED', 'CLOSED',
    'CORRECTION', 'FIRST_FORECAST_LOCKED'
  )),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  scheduled_effective_at timestamptz,
  corrects_event_id text REFERENCES p2_cohort_events(id),
  first_forecast_ref text CHECK (first_forecast_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  locked_registry_root_hash char(64) CHECK (locked_registry_root_hash ~ '^[a-f0-9]{64}$'),
  audit_event_id text UNIQUE REFERENCES p2_operator_audit_events(id),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  effective_at timestamptz GENERATED ALWAYS AS (COALESCE(scheduled_effective_at, recorded_at)) STORED,
  CHECK ((event_type = 'CORRECTION') = (corrects_event_id IS NOT NULL)),
  CHECK ((event_type = 'FIRST_FORECAST_LOCKED') = (first_forecast_ref IS NOT NULL)),
  CHECK ((event_type = 'FIRST_FORECAST_LOCKED') = (locked_registry_root_hash IS NOT NULL)),
  CHECK ((event_type = 'FIRST_FORECAST_LOCKED') = (audit_event_id IS NULL)),
  CHECK ((event_type = 'ACTIVATION_SCHEDULED') = (scheduled_effective_at IS NOT NULL)),
  CHECK (scheduled_effective_at IS NULL OR scheduled_effective_at > recorded_at)
);

CREATE UNIQUE INDEX p2_cohort_one_forecast_lock_idx
  ON p2_cohort_events (cohort_id) WHERE event_type = 'FIRST_FORECAST_LOCKED';
CREATE UNIQUE INDEX p2_cohort_event_once_idx
  ON p2_cohort_events (cohort_id, event_type)
  WHERE event_type IN ('VALIDATED', 'APPROVED', 'CLOSED');
CREATE INDEX p2_cohort_events_timeline_idx
  ON p2_cohort_events (cohort_id, seq);

-- ---------------------------------------------------------------------------
-- Point-in-time sources and evidence states
-- ---------------------------------------------------------------------------

CREATE TABLE p2_source_revisions (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  source_id text NOT NULL CHECK (source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  revision text NOT NULL CHECK (revision ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
  source_kind text NOT NULL CHECK (source_kind IN (
    'BAR', 'TICK', 'ORDER_BOOK', 'FILING', 'FUNDAMENTAL', 'CORPORATE_EVENT',
    'ECONOMIC_EVENT', 'CORPORATE_ACTION', 'CALENDAR', 'BORROW_AVAILABILITY',
    'NEWS_SUMMARY'
  )),
  -- Live and licensed origins are added only by the migration that records
  -- the #14 data-rights gate.
  origin text NOT NULL CHECK (origin IN ('FIXTURE', 'SYNTHETIC')),
  subject text NOT NULL CHECK (subject ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  disclosure_class text NOT NULL CHECK (disclosure_class IN ('PUBLIC', 'PROTECTED', 'LICENSED')),
  published_at timestamptz NOT NULL,
  effective_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  correction_at timestamptz,
  supersedes_revision_id text REFERENCES p2_source_revisions(id),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_id, revision),
  UNIQUE (id, content_hash),
  CHECK (available_at >= published_at),
  CHECK ((correction_at IS NULL) = (supersedes_revision_id IS NULL)),
  CHECK (correction_at IS NULL OR available_at >= correction_at),
  CHECK (supersedes_revision_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX p2_source_one_successor_idx
  ON p2_source_revisions (supersedes_revision_id) WHERE supersedes_revision_id IS NOT NULL;
CREATE INDEX p2_source_revisions_available_idx
  ON p2_source_revisions (source_id, available_at, id);

CREATE TABLE p2_evidence_states (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  pack text NOT NULL CHECK (pack IN ('scalping', 'day', 'swing', 'long-term')),
  mode text NOT NULL CHECK (mode IN ('fixture', 'replay', 'prospective')),
  subject text NOT NULL CHECK (subject ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
  cutoff_at timestamptz NOT NULL,
  normalized_state jsonb NOT NULL CHECK (jsonb_typeof(normalized_state) = 'object'),
  normalized_state_hash char(64) NOT NULL CHECK (normalized_state_hash ~ '^[a-f0-9]{64}$'),
  admission_manifest_hash char(64) NOT NULL CHECK (admission_manifest_hash ~ '^[a-f0-9]{64}$'),
  predecessor_state_id text REFERENCES p2_evidence_states(id),
  link_kind text CHECK (link_kind IN ('REASSESSMENT', 'CORRECTION')),
  change_summary jsonb,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, content_hash),
  CHECK ((predecessor_state_id IS NULL) = (link_kind IS NULL)),
  CHECK ((link_kind IS NULL) = (change_summary IS NULL)),
  CHECK (predecessor_state_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX p2_evidence_state_one_successor_idx
  ON p2_evidence_states (predecessor_state_id, link_kind) WHERE predecessor_state_id IS NOT NULL;
CREATE INDEX p2_evidence_states_cutoff_idx
  ON p2_evidence_states (pack, subject, cutoff_at, id);

CREATE TABLE p2_evidence_state_admissions (
  evidence_state_id text NOT NULL REFERENCES p2_evidence_states(id),
  source_revision_id text NOT NULL,
  source_content_hash char(64) NOT NULL,
  PRIMARY KEY (evidence_state_id, source_revision_id),
  FOREIGN KEY (source_revision_id, source_content_hash)
    REFERENCES p2_source_revisions (id, content_hash)
);

CREATE INDEX p2_evidence_state_admissions_source_idx
  ON p2_evidence_state_admissions (source_revision_id);

-- ---------------------------------------------------------------------------
-- Independent publication receipt observations
-- ---------------------------------------------------------------------------

CREATE TABLE p2_publication_receipts (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  batch_id text NOT NULL CHECK (batch_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  root_hash char(64) NOT NULL CHECK (root_hash ~ '^[a-f0-9]{64}$'),
  sink_id text NOT NULL CHECK (sink_id ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'),
  observation text NOT NULL CHECK (observation IN ('SINK_RECEIPT', 'MISSING', 'SUBMISSION_FAILED')),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  sink_timestamp timestamptz,
  proof_hash char(64) CHECK (proof_hash ~ '^[a-f0-9]{64}$'),
  failure_code text CHECK (failure_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  corrects_receipt_id text REFERENCES p2_publication_receipts(id),
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- The sink's claim, derived by the database. It is never authority:
  -- authority additionally requires independent proof verification (#30).
  claimed_status text GENERATED ALWAYS AS (
    CASE observation
      WHEN 'SINK_RECEIPT' THEN
        CASE WHEN sink_timestamp <= deadline_at THEN 'TIMELY' ELSE 'LATE' END
      WHEN 'MISSING' THEN 'MISSING'
      ELSE 'FAILED'
    END
  ) STORED,
  CHECK (
    (observation = 'SINK_RECEIPT'
      AND submitted_at IS NOT NULL AND sink_timestamp IS NOT NULL
      AND proof_hash IS NOT NULL AND failure_code IS NULL)
    OR (observation = 'MISSING'
      AND sink_timestamp IS NULL AND proof_hash IS NULL
      AND failure_code IS NULL AND observed_at > deadline_at)
    OR (observation = 'SUBMISSION_FAILED'
      AND sink_timestamp IS NULL AND proof_hash IS NULL AND failure_code IS NOT NULL)
  ),
  CHECK (corrects_receipt_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX p2_receipt_one_head_idx
  ON p2_publication_receipts (batch_id) WHERE corrects_receipt_id IS NULL;
CREATE UNIQUE INDEX p2_receipt_one_successor_idx
  ON p2_publication_receipts (corrects_receipt_id) WHERE corrects_receipt_id IS NOT NULL;
CREATE INDEX p2_publication_receipts_batch_idx
  ON p2_publication_receipts (batch_id, seq);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'p2_operator_audit_events', 'p2_registry_entries', 'p2_registry_events',
    'p2_cohorts', 'p2_cohort_registry_refs', 'p2_cohort_events',
    'p2_source_revisions', 'p2_evidence_states', 'p2_evidence_state_admissions',
    'p2_publication_receipts'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_mutation()',
      table_name,
      table_name
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Derived state
-- ---------------------------------------------------------------------------

CREATE FUNCTION p2_registry_entry_status(p_entry_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT event.event_type
    FROM p2_registry_events event
    WHERE event.registry_entry_id = p_entry_id
    ORDER BY event.seq DESC
    LIMIT 1
  ), 'DRAFT')
$$;

CREATE FUNCTION p2_cohort_lifecycle_event(p_cohort_id text)
RETURNS p2_cohort_events
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT event.*
  FROM p2_cohort_events event
  WHERE event.cohort_id = p_cohort_id
    AND event.event_type IN ('VALIDATED', 'APPROVED', 'ACTIVATION_SCHEDULED', 'PAUSED', 'CLOSED')
  ORDER BY event.seq DESC
  LIMIT 1
$$;

-- DRAFT, VALIDATED, APPROVED, ACTIVATION_PENDING, ACTIVE, PAUSED, or CLOSED.
CREATE FUNCTION p2_cohort_status(p_cohort_id text, p_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  latest p2_cohort_events;
BEGIN
  latest := p2_cohort_lifecycle_event(p_cohort_id);
  IF latest.id IS NULL THEN RETURN 'DRAFT'; END IF;
  IF latest.event_type = 'ACTIVATION_SCHEDULED' THEN
    RETURN CASE WHEN latest.effective_at <= p_at THEN 'ACTIVE' ELSE 'ACTIVATION_PENDING' END;
  END IF;
  RETURN latest.event_type;
END
$$;

CREATE FUNCTION p2_registry_root_hash(p_cohort_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p2_sha256_hex(p2_canonical_json(jsonb_build_object(
    'recipe', 'jev-evidence-lab-registry-root/v1',
    'entries', COALESCE(jsonb_agg(jsonb_build_object(
      'slot', ref.slot,
      'kind', ref.registry_kind,
      'entryId', ref.registry_entry_id,
      'contentHash', ref.registry_content_hash
    ) ORDER BY ref.slot COLLATE "C"), '[]'::jsonb)
  )))
  FROM p2_cohort_registry_refs ref
  WHERE ref.cohort_id = p_cohort_id
$$;

CREATE FUNCTION p2_admission_manifest_hash(p_state_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p2_sha256_hex(p2_canonical_json(jsonb_build_object(
    'recipe', 'jev-evidence-lab-admission-manifest/v1',
    'admissions', COALESCE(jsonb_agg(jsonb_build_object(
      'sourceRevisionId', admission.source_revision_id,
      'sourceContentHash', admission.source_content_hash
    ) ORDER BY admission.source_revision_id COLLATE "C"), '[]'::jsonb)
  )))
  FROM p2_evidence_state_admissions admission
  WHERE admission.evidence_state_id = p_state_id
$$;

-- ---------------------------------------------------------------------------
-- Row and commit-time invariants
-- ---------------------------------------------------------------------------

CREATE FUNCTION p2_validate_registry_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  predecessor p2_registry_entries%ROWTYPE;
  horizon_ids text[];
BEGIN
  IF NEW.supersedes_entry_id IS NOT NULL THEN
    SELECT * INTO predecessor FROM p2_registry_entries entry
    WHERE entry.id = NEW.supersedes_entry_id;
    IF predecessor.kind IS DISTINCT FROM NEW.kind
      OR predecessor.pack IS DISTINCT FROM NEW.pack
    THEN
      PERFORM p2_invalid('a registry correction must keep the predecessor kind and pack');
    END IF;
  END IF;

  IF NEW.kind = 'PACK_PROFILE' THEN
    IF NEW.payload ->> 'pack' IS DISTINCT FROM NEW.pack THEN
      PERFORM p2_invalid('pack profile payload must declare its registry pack');
    END IF;
    IF NEW.payload -> 'stances' IS DISTINCT FROM (CASE NEW.pack
      WHEN 'long-term' THEN '["ACCUMULATE","MAINTAIN","DEACCUMULATE","WAIT"]'::jsonb
      ELSE '["LONG","SHORT","WAIT"]'::jsonb
    END) THEN
      PERFORM p2_invalid('pack profile stance vocabulary is invalid for its pack');
    END IF;
    IF NEW.payload -> 'actions' IS DISTINCT FROM (CASE NEW.pack
      WHEN 'long-term' THEN '["BUY","HOLD","REDUCE","EXIT","WAIT"]'::jsonb
      ELSE '["OPEN_LONG","OPEN_SHORT","HOLD","REDUCE","CLOSE","WAIT"]'::jsonb
    END) THEN
      PERFORM p2_invalid('pack profile action vocabulary is invalid for its pack');
    END IF;
    IF NEW.payload -> 'positionSides' IS DISTINCT FROM (CASE NEW.pack
      WHEN 'long-term' THEN '["LONG"]'::jsonb
      ELSE '["LONG","SHORT"]'::jsonb
    END) THEN
      PERFORM p2_invalid('pack profile position sides are invalid for its pack');
    END IF;
    IF jsonb_typeof(NEW.payload -> 'horizons') IS DISTINCT FROM 'array'
      OR jsonb_array_length(NEW.payload -> 'horizons') = 0
    THEN
      PERFORM p2_invalid('pack profile must declare at least one horizon');
    END IF;
    SELECT array_agg(horizon ->> 'id') INTO horizon_ids
    FROM jsonb_array_elements(NEW.payload -> 'horizons') AS horizon;
    IF array_position(horizon_ids, NULL) IS NOT NULL
      OR cardinality(horizon_ids) <> (SELECT count(DISTINCT value) FROM unnest(horizon_ids) AS value)
    THEN
      PERFORM p2_invalid('pack profile horizon identifiers must be present and unique');
    END IF;
    IF NEW.payload #>> '{valuesProvenance,kind}' IS NULL
      OR NEW.payload #>> '{valuesProvenance,kind}' NOT IN ('FIXTURE_PLACEHOLDER', 'TRAINING_ONLY_SELECTION')
    THEN
      PERFORM p2_invalid('pack profile must declare the provenance of its methodology values');
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_registry_entry_contract
  BEFORE INSERT ON p2_registry_entries
  FOR EACH ROW EXECUTE FUNCTION p2_validate_registry_entry();

CREATE FUNCTION p2_validate_registry_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_status text;
BEGIN
  PERFORM 1 FROM p2_registry_entries entry
  WHERE entry.id = NEW.registry_entry_id
  FOR UPDATE;
  current_status := p2_registry_entry_status(NEW.registry_entry_id);
  IF NOT (
    (current_status = 'DRAFT' AND NEW.event_type IN ('VALIDATED', 'RETIRED'))
    OR (current_status = 'VALIDATED' AND NEW.event_type IN ('APPROVED', 'RETIRED'))
    OR (current_status = 'APPROVED' AND NEW.event_type = 'RETIRED')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format('illegal registry transition %s -> %s', current_status, NEW.event_type);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_registry_event_lifecycle
  BEFORE INSERT ON p2_registry_events
  FOR EACH ROW EXECUTE FUNCTION p2_validate_registry_event();

CREATE FUNCTION p2_validate_cohort()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  predecessor p2_cohorts%ROWTYPE;
BEGIN
  IF NEW.predecessor_cohort_id IS NOT NULL THEN
    SELECT * INTO predecessor FROM p2_cohorts cohort
    WHERE cohort.id = NEW.predecessor_cohort_id;
    IF predecessor.pack IS DISTINCT FROM NEW.pack
      OR predecessor.mode IS DISTINCT FROM NEW.mode
    THEN
      PERFORM p2_invalid('a cohort version must keep its predecessor pack and mode');
    END IF;
    IF NEW.cohort_version <> predecessor.cohort_version + 1 THEN
      PERFORM p2_invalid('a cohort version must increment its predecessor version by one');
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_cohort_version_chain
  BEFORE INSERT ON p2_cohorts
  FOR EACH ROW EXECUTE FUNCTION p2_validate_cohort();

-- Shared by the append procedure and the deferred commit-time trigger.
CREATE FUNCTION p2_assert_cohort_complete(p_cohort_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  cohort p2_cohorts%ROWTYPE;
  methodology jsonb;
  profile jsonb;
  ref_count integer;
  horizons jsonb;
  symbols jsonb;
  minimum jsonb;
BEGIN
  SELECT * INTO cohort FROM p2_cohorts WHERE id = p_cohort_id;
  methodology := cohort.methodology;

  SELECT count(*) INTO ref_count FROM p2_cohort_registry_refs ref WHERE ref.cohort_id = p_cohort_id;
  IF ref_count <> 11 THEN
    PERFORM p2_invalid('a cohort must reference exactly one registry entry for each of the 11 methodology slots');
  END IF;
  IF p2_registry_root_hash(p_cohort_id) IS DISTINCT FROM cohort.registry_root_hash THEN
    PERFORM p2_invalid('cohort registry root hash does not match its registry references');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM p2_cohort_registry_refs ref
    JOIN p2_registry_entries entry ON entry.id = ref.registry_entry_id
    WHERE ref.cohort_id = p_cohort_id
      AND entry.pack IS NOT NULL
      AND entry.pack <> cohort.pack
  ) THEN
    PERFORM p2_invalid('a cohort cannot reference another pack''s registry entry');
  END IF;

  SELECT entry.payload INTO profile
  FROM p2_cohort_registry_refs ref
  JOIN p2_registry_entries entry ON entry.id = ref.registry_entry_id
  WHERE ref.cohort_id = p_cohort_id AND ref.slot = 'packProfile';

  PERFORM p2_assert_keys('cohort methodology', methodology, ARRAY[
    'schema', 'horizons', 'universe', 'arms', 'eligibilityRules', 'exclusions',
    'voidRules', 'primaryMetrics', 'minimumEvidence', 'stopRules', 'cadence',
    'budget', 'seeds'
  ]);
  IF methodology ->> 'schema' IS DISTINCT FROM 'jev-evidence-lab-cohort-methodology/v1' THEN
    PERFORM p2_invalid('cohort methodology schema is not supported');
  END IF;

  horizons := methodology -> 'horizons';
  IF jsonb_typeof(horizons) IS DISTINCT FROM 'array' OR jsonb_array_length(horizons) = 0 THEN
    PERFORM p2_invalid('a cohort must preregister at least one horizon');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(horizons) AS horizon
    WHERE jsonb_typeof(horizon) <> 'string'
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(profile -> 'horizons') AS declared
        WHERE declared ->> 'id' = horizon #>> '{}'
      )
  ) OR (SELECT count(DISTINCT horizon) FROM jsonb_array_elements(horizons) AS horizon)
       <> jsonb_array_length(horizons)
  THEN
    PERFORM p2_invalid('cohort horizons must be unique members of its pack profile');
  END IF;

  IF methodology -> 'arms' IS DISTINCT FROM
    '["standard-tools","jev","full-jev-trade","naive-controls"]'::jsonb
  THEN
    PERFORM p2_invalid('a cohort must declare exactly the four comparison arms');
  END IF;

  symbols := methodology #> '{universe,symbols}';
  IF jsonb_typeof(symbols) IS DISTINCT FROM 'array'
    OR jsonb_array_length(symbols) = 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(symbols) AS symbol
      WHERE jsonb_typeof(symbol) <> 'string' OR NOT ((symbol #>> '{}') ~ '^[A-Z][A-Z0-9.-]{0,11}$')
    )
    OR (SELECT count(DISTINCT symbol) FROM jsonb_array_elements(symbols) AS symbol)
       <> jsonb_array_length(symbols)
  THEN
    PERFORM p2_invalid('a cohort universe must list unique valid symbols');
  END IF;

  minimum := methodology -> 'minimumEvidence';
  PERFORM p2_assert_keys('minimum evidence', minimum, ARRAY[
    'resolvedForecasts', 'symbols', 'resolvedPerHorizon', 'clusters'
  ]);
  IF cohort.mode = 'prospective' AND (
    p2_integer(minimum, 'resolvedForecasts', 1) < 100
    OR p2_integer(minimum, 'symbols', 1) < 20
    OR p2_integer(minimum, 'resolvedPerHorizon', 1) < 20
    OR p2_integer(minimum, 'clusters', 1) < 20
  ) THEN
    PERFORM p2_invalid('a prospective cohort cannot preregister evidence minimums below the P2-R45 floor');
  END IF;
  PERFORM p2_integer(minimum, 'resolvedForecasts', 1);
  PERFORM p2_integer(minimum, 'symbols', 1);
  PERFORM p2_integer(minimum, 'resolvedPerHorizon', 1);
  PERFORM p2_integer(minimum, 'clusters', 1);
END
$$;

CREATE FUNCTION p2_check_cohort_complete()
RETURNS trigger
LANGUAGE plpgsql
-- Deferred triggers fire at commit, outside the definer procedure.
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM p2_assert_cohort_complete(NEW.id);
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER p2_cohort_complete_at_commit
  AFTER INSERT ON p2_cohorts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION p2_check_cohort_complete();

CREATE FUNCTION p2_validate_cohort_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  cohort p2_cohorts%ROWTYPE;
  current_status text;
  corrected_cohort_id text;
BEGIN
  SELECT * INTO cohort FROM p2_cohorts WHERE id = NEW.cohort_id FOR UPDATE;
  current_status := p2_cohort_status(NEW.cohort_id, clock_timestamp());

  IF NEW.event_type = 'CORRECTION' THEN
    SELECT event.cohort_id INTO corrected_cohort_id
    FROM p2_cohort_events event WHERE event.id = NEW.corrects_event_id;
    IF corrected_cohort_id IS DISTINCT FROM NEW.cohort_id THEN
      PERFORM p2_invalid('a cohort correction must link an event of the same cohort');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'FIRST_FORECAST_LOCKED' THEN
    IF NEW.locked_registry_root_hash IS DISTINCT FROM cohort.registry_root_hash THEN
      PERFORM p2_invalid('the first forecast must lock the cohort''s preregistered registry root');
    END IF;
    IF NOT (
      current_status = 'ACTIVE'
      OR (cohort.mode <> 'prospective' AND current_status IN ('VALIDATED', 'APPROVED'))
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format('a %s cohort cannot accept its first forecast while %s', cohort.mode, current_status);
    END IF;
    IF EXISTS (
      SELECT 1 FROM p2_cohort_registry_refs ref
      WHERE ref.cohort_id = NEW.cohort_id
        AND p2_registry_entry_status(ref.registry_entry_id) = 'RETIRED'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'a cohort cannot accept its first forecast with a retired registry entry';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (current_status = 'DRAFT' AND NEW.event_type IN ('VALIDATED', 'CLOSED'))
    OR (current_status = 'VALIDATED' AND NEW.event_type IN ('APPROVED', 'CLOSED'))
    OR (current_status = 'APPROVED' AND NEW.event_type IN ('ACTIVATION_SCHEDULED', 'CLOSED'))
    OR (current_status IN ('ACTIVATION_PENDING', 'ACTIVE') AND NEW.event_type IN ('PAUSED', 'CLOSED'))
    OR (current_status = 'PAUSED' AND NEW.event_type IN ('ACTIVATION_SCHEDULED', 'CLOSED'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format('illegal cohort transition %s -> %s', current_status, NEW.event_type);
  END IF;

  IF NEW.event_type IN ('VALIDATED', 'APPROVED', 'ACTIVATION_SCHEDULED') AND EXISTS (
    SELECT 1 FROM p2_cohort_registry_refs ref
    WHERE ref.cohort_id = NEW.cohort_id
      AND p2_registry_entry_status(ref.registry_entry_id) NOT IN ('VALIDATED', 'APPROVED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'every cohort registry entry must be validated and not retired';
  END IF;

  IF NEW.event_type IN ('APPROVED', 'ACTIVATION_SCHEDULED') AND cohort.mode = 'prospective' THEN
    IF EXISTS (
      SELECT 1 FROM p2_cohort_registry_refs ref
      WHERE ref.cohort_id = NEW.cohort_id
        AND p2_registry_entry_status(ref.registry_entry_id) <> 'APPROVED'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'a prospective cohort requires every registry entry to be approved';
    END IF;
    IF EXISTS (
      SELECT 1 FROM p2_cohort_registry_refs ref
      JOIN p2_registry_entries entry ON entry.id = ref.registry_entry_id
      WHERE ref.cohort_id = NEW.cohort_id AND ref.slot = 'packProfile'
        AND entry.payload #>> '{valuesProvenance,kind}' = 'FIXTURE_PLACEHOLDER'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'a prospective cohort cannot use fixture placeholder methodology values';
    END IF;
  END IF;

  IF NEW.event_type = 'ACTIVATION_SCHEDULED' AND cohort.mode = 'prospective' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'JTG01',
      MESSAGE = 'prospective activation is gated until the readiness, data-rights, and timestamp-sink receipts exist';
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
  predecessor p2_source_revisions%ROWTYPE;
BEGIN
  IF NEW.supersedes_revision_id IS NOT NULL THEN
    SELECT * INTO predecessor FROM p2_source_revisions source
    WHERE source.id = NEW.supersedes_revision_id;
    IF predecessor.source_id IS DISTINCT FROM NEW.source_id
      OR predecessor.source_kind IS DISTINCT FROM NEW.source_kind
      OR predecessor.subject IS DISTINCT FROM NEW.subject
      OR predecessor.origin IS DISTINCT FROM NEW.origin
    THEN
      PERFORM p2_invalid('a source correction must keep the source identity, kind, subject, and origin');
    END IF;
    IF NEW.available_at <= predecessor.available_at
      OR NEW.correction_at < predecessor.published_at
    THEN
      PERFORM p2_invalid('a source correction must become available after its predecessor');
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
DECLARE
  predecessor p2_evidence_states%ROWTYPE;
BEGIN
  IF NEW.normalized_state_hash IS DISTINCT FROM p2_sha256_hex(p2_canonical_json(jsonb_build_object(
    'recipe', 'jev-evidence-lab-normalized-state/v1',
    'state', NEW.normalized_state
  ))) THEN
    PERFORM p2_invalid('normalized state hash does not match the normalized state');
  END IF;
  IF NEW.predecessor_state_id IS NOT NULL THEN
    SELECT * INTO predecessor FROM p2_evidence_states state
    WHERE state.id = NEW.predecessor_state_id;
    IF predecessor.pack IS DISTINCT FROM NEW.pack
      OR predecessor.mode IS DISTINCT FROM NEW.mode
      OR predecessor.subject IS DISTINCT FROM NEW.subject
    THEN
      PERFORM p2_invalid('a linked evidence state must keep its predecessor pack, mode, and subject');
    END IF;
    IF NEW.link_kind = 'REASSESSMENT' AND NEW.cutoff_at <= predecessor.cutoff_at THEN
      PERFORM p2_invalid('a reassessment must use a later cutoff than its predecessor');
    END IF;
    IF NEW.link_kind = 'CORRECTION' AND NEW.cutoff_at <> predecessor.cutoff_at THEN
      PERFORM p2_invalid('an evidence correction must keep its predecessor cutoff');
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_evidence_state_contract
  BEFORE INSERT ON p2_evidence_states
  FOR EACH ROW EXECUTE FUNCTION p2_validate_evidence_state();

CREATE FUNCTION p2_validate_evidence_admission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  state p2_evidence_states%ROWTYPE;
  source p2_source_revisions%ROWTYPE;
BEGIN
  SELECT * INTO state FROM p2_evidence_states WHERE id = NEW.evidence_state_id;
  SELECT * INTO source FROM p2_source_revisions WHERE id = NEW.source_revision_id;
  IF source.available_at > state.cutoff_at THEN
    PERFORM p2_invalid('an evidence state cannot admit a source available after its cutoff');
  END IF;
  IF EXISTS (
    SELECT 1 FROM p2_source_revisions successor
    WHERE successor.supersedes_revision_id = source.id
      AND successor.available_at <= state.cutoff_at
  ) THEN
    PERFORM p2_invalid('an evidence state cannot admit a revision superseded before its cutoff');
  END IF;
  IF state.mode = 'prospective' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'JTG01',
      MESSAGE = 'a prospective evidence state requires a rights-cleared live source origin, which this schema version does not provide';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_evidence_admission_cutoff
  BEFORE INSERT ON p2_evidence_state_admissions
  FOR EACH ROW EXECUTE FUNCTION p2_validate_evidence_admission();

CREATE FUNCTION p2_assert_evidence_state_complete(p_state_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  state p2_evidence_states%ROWTYPE;
  added jsonb;
  removed jsonb;
BEGIN
  SELECT * INTO state FROM p2_evidence_states WHERE id = p_state_id;
  IF NOT EXISTS (
    SELECT 1 FROM p2_evidence_state_admissions admission
    WHERE admission.evidence_state_id = p_state_id
  ) THEN
    PERFORM p2_invalid('an evidence state must admit at least one source revision');
  END IF;
  IF p2_admission_manifest_hash(p_state_id) IS DISTINCT FROM state.admission_manifest_hash THEN
    PERFORM p2_invalid('admission manifest hash does not match the admitted source revisions');
  END IF;
  IF state.predecessor_state_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(current.source_revision_id ORDER BY current.source_revision_id COLLATE "C"), '[]'::jsonb)
    INTO added
    FROM p2_evidence_state_admissions current
    WHERE current.evidence_state_id = p_state_id
      AND NOT EXISTS (
        SELECT 1 FROM p2_evidence_state_admissions prior
        WHERE prior.evidence_state_id = state.predecessor_state_id
          AND prior.source_revision_id = current.source_revision_id
      );
    SELECT COALESCE(jsonb_agg(prior.source_revision_id ORDER BY prior.source_revision_id COLLATE "C"), '[]'::jsonb)
    INTO removed
    FROM p2_evidence_state_admissions prior
    WHERE prior.evidence_state_id = state.predecessor_state_id
      AND NOT EXISTS (
        SELECT 1 FROM p2_evidence_state_admissions current
        WHERE current.evidence_state_id = p_state_id
          AND current.source_revision_id = prior.source_revision_id
      );
    IF state.change_summary -> 'addedSourceRevisionIds' IS DISTINCT FROM added
      OR state.change_summary -> 'removedSourceRevisionIds' IS DISTINCT FROM removed
    THEN
      PERFORM p2_invalid('change summary must state exactly which admitted sources changed');
    END IF;
    IF state.link_kind = 'CORRECTION' AND added = '[]'::jsonb AND removed = '[]'::jsonb
      AND (SELECT prior.normalized_state_hash FROM p2_evidence_states prior WHERE prior.id = state.predecessor_state_id)
          = state.normalized_state_hash
    THEN
      PERFORM p2_invalid('an evidence correction must change its admissions or normalized state');
    END IF;
  END IF;
END
$$;

CREATE FUNCTION p2_check_evidence_state_complete()
RETURNS trigger
LANGUAGE plpgsql
-- Deferred triggers fire at commit, outside the definer procedure.
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM p2_assert_evidence_state_complete(NEW.id);
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER p2_evidence_state_complete_at_commit
  AFTER INSERT ON p2_evidence_states
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION p2_check_evidence_state_complete();

CREATE FUNCTION p2_validate_publication_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  head p2_publication_receipts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_publication_receipts:' || NEW.batch_id, 0));
  SELECT * INTO head FROM p2_publication_receipts receipt
  WHERE receipt.batch_id = NEW.batch_id
  ORDER BY receipt.seq DESC
  LIMIT 1;
  IF head.id IS NULL THEN
    IF NEW.corrects_receipt_id IS NOT NULL THEN
      PERFORM p2_invalid('the first receipt observation of a batch cannot be a correction');
    END IF;
  ELSE
    IF NEW.corrects_receipt_id IS DISTINCT FROM head.id THEN
      PERFORM p2_invalid('a later receipt observation must link the batch''s latest observation');
    END IF;
    IF NEW.root_hash IS DISTINCT FROM head.root_hash
      OR NEW.deadline_at IS DISTINCT FROM head.deadline_at
    THEN
      PERFORM p2_invalid('receipt observations for one batch must bind the same root and deadline');
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_publication_receipt_chain
  BEFORE INSERT ON p2_publication_receipts
  FOR EACH ROW EXECUTE FUNCTION p2_validate_publication_receipt();

-- ---------------------------------------------------------------------------
-- Operator procedures
-- ---------------------------------------------------------------------------

CREATE FUNCTION p2_accept_operator_command(
  p_audit jsonb,
  p_command text,
  p_target_kind text,
  p_target_id text,
  p_target_content_hash text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  audit jsonb;
  existing p2_operator_audit_events%ROWTYPE;
BEGIN
  audit := p2_verify_envelope('operator_audit_event', p_audit);
  PERFORM p2_assert_keys('operator audit event', audit, ARRAY[
    'id', 'command', 'outcome', 'rejectionCode', 'credentialClass',
    'actorFingerprint', 'idempotencyKey', 'requestHash', 'targetKind', 'targetId'
  ]);
  IF audit ->> 'outcome' IS DISTINCT FROM 'ACCEPTED'
    OR audit -> 'rejectionCode' IS DISTINCT FROM 'null'::jsonb
    OR audit ->> 'command' IS DISTINCT FROM p_command
    OR audit ->> 'targetKind' IS DISTINCT FROM p_target_kind
    OR audit ->> 'targetId' IS DISTINCT FROM p_target_id
  THEN
    PERFORM p2_invalid('operator audit event does not describe this accepted command');
  END IF;
  IF audit ->> 'requestHash' IS DISTINCT FROM
    p2_command_request_hash(p_command, p_target_kind, p_target_id, p_target_content_hash)
  THEN
    PERFORM p2_invalid('operator audit request hash does not bind the command target');
  END IF;

  SELECT * INTO existing FROM p2_operator_audit_events event
  WHERE event.idempotency_key = audit ->> 'idempotencyKey' AND event.outcome = 'ACCEPTED';
  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'idempotency key was already used for a different request';
  END IF;

  INSERT INTO p2_operator_audit_events (
    id, command, outcome, rejection_code, credential_class, actor_fingerprint,
    idempotency_key, request_hash, target_kind, target_id, canonical_payload, content_hash
  ) VALUES (
    p2_text(audit, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p_command, 'ACCEPTED', NULL,
    p2_text(audit, 'credentialClass', '^OPERATOR_TOKEN$'),
    p2_text(audit, 'actorFingerprint', '^[a-f0-9]{64}$'),
    p2_text(audit, 'idempotencyKey', '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
    audit ->> 'requestHash', p_target_kind, p_target_id,
    p_audit ->> 'canonicalPayload', p_audit ->> 'contentHash'
  );
  RETURN audit ->> 'id';
END
$$;

-- A retried command returns the original target only when both the target
-- content and the idempotency key match what was recorded.
CREATE FUNCTION p2_assert_command_replay(
  p_existing_content_hash text,
  p_existing_audit_event_id text,
  p_target_input jsonb,
  p_audit jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_existing_content_hash IS DISTINCT FROM p_target_input ->> 'contentHash' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'record id conflicts with a different immutable payload';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM p2_operator_audit_events event
    WHERE event.id = p_existing_audit_event_id
      AND event.idempotency_key = p_audit ->> 'idempotencyKey'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'record already exists under a different idempotency key';
  END IF;
END
$$;

CREATE FUNCTION p2_append_registry_entry(p_entry jsonb, p_audit jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  fields jsonb;
  existing p2_registry_entries%ROWTYPE;
  audit_id text;
BEGIN
  fields := p2_verify_envelope('registry_entry', p_entry);
  PERFORM p2_assert_keys('registry entry', fields, ARRAY[
    'id', 'kind', 'version', 'pack', 'supersedesEntryId', 'payload'
  ]);
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_registry_entries:' || (fields ->> 'id'), 0));
  SELECT * INTO existing FROM p2_registry_entries entry WHERE entry.id = fields ->> 'id';
  IF FOUND THEN
    PERFORM p2_assert_command_replay(existing.content_hash, existing.audit_event_id, p_entry, p_audit);
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;

  audit_id := p2_accept_operator_command(
    p_audit, 'APPEND_REGISTRY_ENTRY', 'REGISTRY_ENTRY', fields ->> 'id', p_entry ->> 'contentHash'
  );
  INSERT INTO p2_registry_entries (
    id, kind, version, pack, supersedes_entry_id, payload, audit_event_id,
    canonical_payload, content_hash
  ) VALUES (
    p2_text(fields, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(fields, 'kind', '^[A-Z_]+$'),
    p2_text(fields, 'version', '^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$'),
    p2_text(fields, 'pack', '^(scalping|day|swing|long-term)$', true),
    p2_text(fields, 'supersedesEntryId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$', true),
    fields -> 'payload', audit_id,
    p_entry ->> 'canonicalPayload', p_entry ->> 'contentHash'
  );
  RETURN QUERY SELECT true, fields ->> 'id';
END
$$;

CREATE FUNCTION p2_append_registry_event(p_event jsonb, p_audit jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payload jsonb;
  existing p2_registry_events%ROWTYPE;
  audit_id text;
BEGIN
  payload := p2_verify_envelope('registry_event', p_event);
  PERFORM p2_assert_keys('registry event', payload, ARRAY[
    'id', 'registryEntryId', 'eventType', 'reason', 'reviewReference'
  ]);
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_registry_events:' || (payload ->> 'id'), 0));
  SELECT * INTO existing FROM p2_registry_events event WHERE event.id = payload ->> 'id';
  IF FOUND THEN
    PERFORM p2_assert_command_replay(existing.content_hash, existing.audit_event_id, p_event, p_audit);
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;

  audit_id := p2_accept_operator_command(
    p_audit, 'APPEND_REGISTRY_EVENT', 'REGISTRY_EVENT', payload ->> 'id', p_event ->> 'contentHash'
  );
  INSERT INTO p2_registry_events (
    id, registry_entry_id, event_type, reason, review_reference, audit_event_id,
    canonical_payload, content_hash
  ) VALUES (
    p2_text(payload, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'registryEntryId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'eventType', '^(VALIDATED|APPROVED|RETIRED)$'),
    p2_text(payload, 'reason', '^[^[:cntrl:]]+$'),
    p2_text(payload, 'reviewReference', '^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$', true),
    audit_id, p_event ->> 'canonicalPayload', p_event ->> 'contentHash'
  );
  RETURN QUERY SELECT true, payload ->> 'id';
END
$$;

CREATE FUNCTION p2_append_cohort(p_cohort jsonb, p_audit jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payload jsonb;
  existing p2_cohorts%ROWTYPE;
  audit_id text;
  tuple jsonb;
  slot_ref record;
BEGIN
  payload := p2_verify_envelope('cohort', p_cohort);
  PERFORM p2_assert_keys('cohort', payload, ARRAY[
    'id', 'pack', 'mode', 'cohortVersion', 'predecessorCohortId',
    'registryTuple', 'registryRootHash', 'methodology'
  ]);
  tuple := payload -> 'registryTuple';
  PERFORM p2_assert_keys('cohort registry tuple', tuple, ARRAY[
    'packProfile', 'feature', 'prompt', 'model', 'risk', 'policy',
    'execution', 'costScenarios', 'outcome', 'baseline', 'metric'
  ]);
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_cohorts:' || (payload ->> 'id'), 0));
  SELECT * INTO existing FROM p2_cohorts cohort WHERE cohort.id = payload ->> 'id';
  IF FOUND THEN
    PERFORM p2_assert_command_replay(existing.content_hash, existing.audit_event_id, p_cohort, p_audit);
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;

  audit_id := p2_accept_operator_command(
    p_audit, 'APPEND_COHORT', 'COHORT', payload ->> 'id', p_cohort ->> 'contentHash'
  );
  INSERT INTO p2_cohorts (
    id, pack, mode, cohort_version, predecessor_cohort_id, registry_root_hash,
    methodology, audit_event_id, canonical_payload, content_hash
  ) VALUES (
    p2_text(payload, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'pack', '^(scalping|day|swing|long-term)$'),
    p2_text(payload, 'mode', '^(fixture|replay|prospective)$'),
    p2_integer(payload, 'cohortVersion', 1),
    p2_text(payload, 'predecessorCohortId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$', true),
    p2_text(payload, 'registryRootHash', '^[a-f0-9]{64}$'),
    payload -> 'methodology', audit_id,
    p_cohort ->> 'canonicalPayload', p_cohort ->> 'contentHash'
  );

  FOR slot_ref IN SELECT slot.key, slot.value FROM jsonb_each(tuple) AS slot LOOP
    PERFORM p2_assert_keys('registry reference ' || slot_ref.key, slot_ref.value, ARRAY['entryId', 'contentHash']);
    INSERT INTO p2_cohort_registry_refs (
      cohort_id, slot, registry_entry_id, registry_kind, registry_content_hash
    ) VALUES (
      payload ->> 'id', slot_ref.key,
      p2_text(slot_ref.value, 'entryId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      CASE slot_ref.key
        WHEN 'packProfile' THEN 'PACK_PROFILE' WHEN 'feature' THEN 'FEATURE'
        WHEN 'prompt' THEN 'PROMPT' WHEN 'model' THEN 'MODEL' WHEN 'risk' THEN 'RISK'
        WHEN 'policy' THEN 'POLICY' WHEN 'execution' THEN 'EXECUTION'
        WHEN 'costScenarios' THEN 'COST_SCENARIO' WHEN 'outcome' THEN 'OUTCOME'
        WHEN 'baseline' THEN 'BASELINE' WHEN 'metric' THEN 'METRIC'
      END,
      p2_text(slot_ref.value, 'contentHash', '^[a-f0-9]{64}$')
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM p2_cohort_registry_refs ref
    WHERE ref.cohort_id = payload ->> 'id'
      AND p2_registry_entry_status(ref.registry_entry_id) = 'RETIRED'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'a new cohort cannot reference a retired registry entry';
  END IF;
  PERFORM p2_assert_cohort_complete(payload ->> 'id');
  RETURN QUERY SELECT true, payload ->> 'id';
END
$$;

CREATE FUNCTION p2_append_cohort_event(p_event jsonb, p_audit jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payload jsonb;
  existing p2_cohort_events%ROWTYPE;
  audit_id text;
BEGIN
  payload := p2_verify_envelope('cohort_event', p_event);
  PERFORM p2_assert_keys('cohort event', payload, ARRAY[
    'id', 'cohortId', 'eventType', 'reason', 'scheduledEffectiveAt', 'correctsEventId'
  ]);
  PERFORM 1 FROM p2_cohorts cohort WHERE cohort.id = payload ->> 'cohortId' FOR UPDATE;
  SELECT * INTO existing FROM p2_cohort_events event WHERE event.id = payload ->> 'id';
  IF FOUND THEN
    PERFORM p2_assert_command_replay(existing.content_hash, existing.audit_event_id, p_event, p_audit);
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;

  audit_id := p2_accept_operator_command(
    p_audit, 'APPEND_COHORT_EVENT', 'COHORT_EVENT', payload ->> 'id', p_event ->> 'contentHash'
  );
  INSERT INTO p2_cohort_events (
    id, cohort_id, event_type, reason, scheduled_effective_at, corrects_event_id,
    audit_event_id, canonical_payload, content_hash
  ) VALUES (
    p2_text(payload, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'cohortId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'eventType', '^(VALIDATED|APPROVED|ACTIVATION_SCHEDULED|PAUSED|CLOSED|CORRECTION)$'),
    p2_text(payload, 'reason', '^[^[:cntrl:]]+$'),
    p2_timestamp(payload, 'scheduledEffectiveAt', true),
    p2_text(payload, 'correctsEventId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$', true),
    audit_id, p_event ->> 'canonicalPayload', p_event ->> 'contentHash'
  );
  RETURN QUERY SELECT true, payload ->> 'id';
END
$$;

-- Records a command the application refused, in its own transaction, so the
-- refusal remains visible even though the command changed nothing.
CREATE FUNCTION p2_append_rejected_operator_command(p_audit jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  audit jsonb;
  existing p2_operator_audit_events%ROWTYPE;
BEGIN
  audit := p2_verify_envelope('operator_audit_event', p_audit);
  PERFORM p2_assert_keys('operator audit event', audit, ARRAY[
    'id', 'command', 'outcome', 'rejectionCode', 'credentialClass',
    'actorFingerprint', 'idempotencyKey', 'requestHash', 'targetKind', 'targetId'
  ]);
  IF audit ->> 'outcome' IS DISTINCT FROM 'REJECTED' THEN
    PERFORM p2_invalid('only rejected commands may be audited without their effect');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_operator_audit_events:' || (audit ->> 'id'), 0));
  SELECT * INTO existing FROM p2_operator_audit_events event WHERE event.id = audit ->> 'id';
  IF FOUND THEN
    IF existing.content_hash IS DISTINCT FROM p_audit ->> 'contentHash' THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'record id conflicts with a different immutable payload';
    END IF;
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;
  INSERT INTO p2_operator_audit_events (
    id, command, outcome, rejection_code, credential_class, actor_fingerprint,
    idempotency_key, request_hash, target_kind, target_id, canonical_payload, content_hash
  ) VALUES (
    p2_text(audit, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(audit, 'command', '^(APPEND_REGISTRY_ENTRY|APPEND_REGISTRY_EVENT|APPEND_COHORT|APPEND_COHORT_EVENT)$'),
    'REJECTED',
    p2_text(audit, 'rejectionCode', '^[A-Z][A-Z0-9_]{2,63}$'),
    p2_text(audit, 'credentialClass', '^OPERATOR_TOKEN$'),
    p2_text(audit, 'actorFingerprint', '^[a-f0-9]{64}$'),
    p2_text(audit, 'idempotencyKey', '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
    p2_text(audit, 'requestHash', '^[a-f0-9]{64}$'),
    p2_text(audit, 'targetKind', '^(REGISTRY_ENTRY|REGISTRY_EVENT|COHORT|COHORT_EVENT)$'),
    p2_text(audit, 'targetId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p_audit ->> 'canonicalPayload', p_audit ->> 'contentHash'
  );
  RETURN QUERY SELECT true, audit ->> 'id';
END
$$;

-- ---------------------------------------------------------------------------
-- Worker procedures
-- ---------------------------------------------------------------------------

CREATE FUNCTION p2_record_first_forecast_lock(p_lock jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payload jsonb;
  existing p2_cohort_events%ROWTYPE;
BEGIN
  payload := p2_verify_envelope('cohort_forecast_lock', p_lock);
  PERFORM p2_assert_keys('first forecast lock', payload, ARRAY[
    'id', 'cohortId', 'firstForecastRef', 'lockedRegistryRootHash', 'reason'
  ]);
  PERFORM 1 FROM p2_cohorts cohort WHERE cohort.id = payload ->> 'cohortId' FOR UPDATE;
  SELECT * INTO existing FROM p2_cohort_events event
  WHERE event.id = payload ->> 'id'
     OR (event.cohort_id = payload ->> 'cohortId' AND event.event_type = 'FIRST_FORECAST_LOCKED');
  IF FOUND THEN
    IF existing.id IS DISTINCT FROM payload ->> 'id'
      OR existing.content_hash IS DISTINCT FROM p_lock ->> 'contentHash'
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'the first forecast lock of a cohort is immutable';
    END IF;
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;
  INSERT INTO p2_cohort_events (
    id, cohort_id, event_type, reason, first_forecast_ref, locked_registry_root_hash,
    canonical_payload, content_hash
  ) VALUES (
    p2_text(payload, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'cohortId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    'FIRST_FORECAST_LOCKED',
    p2_text(payload, 'reason', '^[^[:cntrl:]]+$'),
    p2_text(payload, 'firstForecastRef', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'lockedRegistryRootHash', '^[a-f0-9]{64}$'),
    p_lock ->> 'canonicalPayload', p_lock ->> 'contentHash'
  );
  RETURN QUERY SELECT true, payload ->> 'id';
END
$$;

CREATE FUNCTION p2_append_source_revision(p_source jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payload jsonb;
  existing p2_source_revisions%ROWTYPE;
BEGIN
  payload := p2_verify_envelope('source_revision', p_source);
  PERFORM p2_assert_keys('source revision', payload, ARRAY[
    'id', 'sourceId', 'revision', 'sourceKind', 'origin', 'subject', 'payloadHash',
    'disclosureClass', 'publishedAt', 'effectiveAt', 'ingestedAt', 'availableAt',
    'correctionAt', 'supersedesRevisionId'
  ]);
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_source_revisions:' || (payload ->> 'id'), 0));
  SELECT * INTO existing FROM p2_source_revisions source WHERE source.id = payload ->> 'id';
  IF FOUND THEN
    IF existing.content_hash IS DISTINCT FROM p_source ->> 'contentHash' THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'record id conflicts with a different immutable payload';
    END IF;
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;
  INSERT INTO p2_source_revisions (
    id, source_id, revision, source_kind, origin, subject, payload_hash,
    disclosure_class, published_at, effective_at, ingested_at, available_at,
    correction_at, supersedes_revision_id, canonical_payload, content_hash
  ) VALUES (
    p2_text(payload, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'sourceId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'revision', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
    p2_text(payload, 'sourceKind', '^[A-Z_]+$'),
    p2_text(payload, 'origin', '^[A-Z_]+$'),
    p2_text(payload, 'subject', '^[A-Z][A-Z0-9.-]{0,11}$'),
    p2_text(payload, 'payloadHash', '^[a-f0-9]{64}$'),
    p2_text(payload, 'disclosureClass', '^(PUBLIC|PROTECTED|LICENSED)$'),
    p2_timestamp(payload, 'publishedAt'),
    p2_timestamp(payload, 'effectiveAt'),
    p2_timestamp(payload, 'ingestedAt'),
    p2_timestamp(payload, 'availableAt'),
    p2_timestamp(payload, 'correctionAt', true),
    p2_text(payload, 'supersedesRevisionId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$', true),
    p_source ->> 'canonicalPayload', p_source ->> 'contentHash'
  );
  RETURN QUERY SELECT true, payload ->> 'id';
END
$$;

CREATE FUNCTION p2_append_evidence_state(p_state jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payload jsonb;
  existing p2_evidence_states%ROWTYPE;
  admissions jsonb;
  summary jsonb;
  previous_id text := NULL;
  admission jsonb;
BEGIN
  payload := p2_verify_envelope('evidence_state', p_state);
  PERFORM p2_assert_keys('evidence state', payload, ARRAY[
    'id', 'pack', 'mode', 'subject', 'cutoffAt', 'admissions', 'admissionManifestHash',
    'normalizedState', 'normalizedStateHash', 'predecessorStateId', 'linkKind', 'changeSummary'
  ]);
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_evidence_states:' || (payload ->> 'id'), 0));
  SELECT * INTO existing FROM p2_evidence_states state WHERE state.id = payload ->> 'id';
  IF FOUND THEN
    IF existing.content_hash IS DISTINCT FROM p_state ->> 'contentHash' THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'record id conflicts with a different immutable payload';
    END IF;
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;

  summary := payload -> 'changeSummary';
  IF summary IS DISTINCT FROM 'null'::jsonb THEN
    PERFORM p2_assert_keys('change summary', summary, ARRAY[
      'addedSourceRevisionIds', 'removedSourceRevisionIds', 'reason'
    ]);
    IF char_length(p2_text(summary, 'reason', '^[^[:cntrl:]]+$')) > 500 THEN
      PERFORM p2_invalid('change summary reason exceeds 500 characters');
    END IF;
  END IF;

  INSERT INTO p2_evidence_states (
    id, pack, mode, subject, cutoff_at, normalized_state, normalized_state_hash,
    admission_manifest_hash, predecessor_state_id, link_kind, change_summary,
    canonical_payload, content_hash
  ) VALUES (
    p2_text(payload, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'pack', '^(scalping|day|swing|long-term)$'),
    p2_text(payload, 'mode', '^(fixture|replay|prospective)$'),
    p2_text(payload, 'subject', '^[A-Z][A-Z0-9.-]{0,11}$'),
    p2_timestamp(payload, 'cutoffAt'),
    payload -> 'normalizedState',
    p2_text(payload, 'normalizedStateHash', '^[a-f0-9]{64}$'),
    p2_text(payload, 'admissionManifestHash', '^[a-f0-9]{64}$'),
    p2_text(payload, 'predecessorStateId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$', true),
    p2_text(payload, 'linkKind', '^(REASSESSMENT|CORRECTION)$', true),
    NULLIF(summary, 'null'::jsonb),
    p_state ->> 'canonicalPayload', p_state ->> 'contentHash'
  );

  admissions := payload -> 'admissions';
  IF jsonb_typeof(admissions) IS DISTINCT FROM 'array' THEN
    PERFORM p2_invalid('admissions must be an array');
  END IF;
  FOR admission IN SELECT value FROM jsonb_array_elements(admissions) LOOP
    PERFORM p2_assert_keys('admission', admission, ARRAY['sourceRevisionId', 'sourceContentHash']);
    IF previous_id IS NOT NULL
      AND NOT (previous_id COLLATE "C" < (admission ->> 'sourceRevisionId') COLLATE "C")
    THEN
      PERFORM p2_invalid('admissions must be unique and sorted by source revision id');
    END IF;
    previous_id := admission ->> 'sourceRevisionId';
    INSERT INTO p2_evidence_state_admissions (
      evidence_state_id, source_revision_id, source_content_hash
    ) VALUES (
      payload ->> 'id',
      p2_text(admission, 'sourceRevisionId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      p2_text(admission, 'sourceContentHash', '^[a-f0-9]{64}$')
    );
  END LOOP;

  PERFORM p2_assert_evidence_state_complete(payload ->> 'id');
  RETURN QUERY SELECT true, payload ->> 'id';
END
$$;

CREATE FUNCTION p2_append_publication_receipt(p_receipt jsonb)
RETURNS TABLE (created boolean, record_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payload jsonb;
  existing p2_publication_receipts%ROWTYPE;
BEGIN
  payload := p2_verify_envelope('publication_receipt', p_receipt);
  PERFORM p2_assert_keys('publication receipt', payload, ARRAY[
    'id', 'batchId', 'rootHash', 'sinkId', 'observation', 'deadlineAt', 'submittedAt',
    'sinkTimestamp', 'proofHash', 'failureCode', 'correctsReceiptId'
  ]);
  PERFORM pg_advisory_xact_lock(hashtextextended('p2_publication_receipts:' || (payload ->> 'batchId'), 0));
  SELECT * INTO existing FROM p2_publication_receipts receipt WHERE receipt.id = payload ->> 'id';
  IF FOUND THEN
    IF existing.content_hash IS DISTINCT FROM p_receipt ->> 'contentHash' THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'record id conflicts with a different immutable payload';
    END IF;
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;
  INSERT INTO p2_publication_receipts (
    id, batch_id, root_hash, sink_id, observation, deadline_at, submitted_at,
    sink_timestamp, proof_hash, failure_code, corrects_receipt_id,
    canonical_payload, content_hash
  ) VALUES (
    p2_text(payload, 'id', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'batchId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
    p2_text(payload, 'rootHash', '^[a-f0-9]{64}$'),
    p2_text(payload, 'sinkId', '^[a-z0-9][a-z0-9._:-]{2,79}$'),
    p2_text(payload, 'observation', '^(SINK_RECEIPT|MISSING|SUBMISSION_FAILED)$'),
    p2_timestamp(payload, 'deadlineAt'),
    p2_timestamp(payload, 'submittedAt', true),
    p2_timestamp(payload, 'sinkTimestamp', true),
    p2_text(payload, 'proofHash', '^[a-f0-9]{64}$', true),
    p2_text(payload, 'failureCode', '^[A-Z][A-Z0-9_]{2,63}$', true),
    p2_text(payload, 'correctsReceiptId', '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$', true),
    p_receipt ->> 'canonicalPayload', p_receipt ->> 'contentHash'
  );
  RETURN QUERY SELECT true, payload ->> 'id';
END
$$;

-- ---------------------------------------------------------------------------
-- Safe reads (metadata only unless the caller is the worker)
-- ---------------------------------------------------------------------------

CREATE FUNCTION p2_read_registry_entry_status(p_entry_id text)
RETURNS TABLE (
  entry_id text, kind text, version text, pack text, supersedes_entry_id text,
  content_hash char(64), lifecycle_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT entry.id, entry.kind, entry.version, entry.pack, entry.supersedes_entry_id,
         entry.content_hash, p2_registry_entry_status(entry.id)
  FROM p2_registry_entries entry
  WHERE entry.id = p_entry_id
$$;

CREATE FUNCTION p2_read_cohort_status(p_cohort_id text)
RETURNS TABLE (
  cohort_id text, pack text, mode text, cohort_version integer,
  predecessor_cohort_id text, registry_root_hash char(64), content_hash char(64),
  lifecycle_status text, first_forecast_ref text, first_forecast_locked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT cohort.id, cohort.pack, cohort.mode, cohort.cohort_version,
         cohort.predecessor_cohort_id, cohort.registry_root_hash, cohort.content_hash,
         p2_cohort_status(cohort.id, clock_timestamp()),
         lock.first_forecast_ref, lock.recorded_at
  FROM p2_cohorts cohort
  LEFT JOIN p2_cohort_events lock
    ON lock.cohort_id = cohort.id AND lock.event_type = 'FIRST_FORECAST_LOCKED'
  WHERE cohort.id = p_cohort_id
$$;

CREATE FUNCTION p2_read_source_revisions_as_of(p_source_id text, p_as_of timestamptz)
RETURNS TABLE (
  revision_id text, revision text, content_hash char(64), source_kind text,
  origin text, subject text, disclosure_class text, published_at timestamptz,
  effective_at timestamptz, ingested_at timestamptz, available_at timestamptz,
  correction_at timestamptz, supersedes_revision_id text, eligible boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT source.id, source.revision, source.content_hash, source.source_kind,
         source.origin, source.subject, source.disclosure_class, source.published_at,
         source.effective_at, source.ingested_at, source.available_at,
         source.correction_at, source.supersedes_revision_id,
         source.available_at <= p_as_of AND NOT EXISTS (
           SELECT 1 FROM p2_source_revisions successor
           WHERE successor.supersedes_revision_id = source.id
             AND successor.available_at <= p_as_of
         )
  FROM p2_source_revisions source
  WHERE source.source_id = p_source_id
  ORDER BY source.available_at, source.id
$$;

CREATE FUNCTION p2_read_evidence_state(p_state_id text)
RETURNS TABLE (
  state_id text, pack text, mode text, subject text, cutoff_at timestamptz,
  normalized_state jsonb, normalized_state_hash char(64),
  admission_manifest_hash char(64), content_hash char(64),
  predecessor_state_id text, link_kind text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT state.id, state.pack, state.mode, state.subject, state.cutoff_at,
         state.normalized_state, state.normalized_state_hash,
         state.admission_manifest_hash, state.content_hash,
         state.predecessor_state_id, state.link_kind
  FROM p2_evidence_states state
  WHERE state.id = p_state_id
$$;

-- No receipt is authoritative in this schema version. The independent sink
-- verifier (#30) is the only component that may add authority.
CREATE FUNCTION p2_read_receipt_authority(p_batch_id text)
RETURNS TABLE (
  receipt_id text, batch_id text, root_hash char(64), observation text,
  claimed_status text, observed_at timestamptz, is_latest boolean,
  authoritative boolean, blockers text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT receipt.id, receipt.batch_id, receipt.root_hash, receipt.observation,
         receipt.claimed_status, receipt.observed_at,
         receipt.seq = max(receipt.seq) OVER (),
         false,
         array_remove(ARRAY[
           CASE WHEN receipt.claimed_status <> 'TIMELY' THEN 'RECEIPT_' || receipt.claimed_status END,
           'INDEPENDENT_SINK_VERIFICATION_UNAVAILABLE'
         ], NULL)
  FROM p2_publication_receipts receipt
  WHERE receipt.batch_id = p_batch_id
  ORDER BY receipt.seq
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE
  p2_operator_audit_events, p2_registry_entries, p2_registry_events,
  p2_cohorts, p2_cohort_registry_refs, p2_cohort_events,
  p2_source_revisions, p2_evidence_states, p2_evidence_state_admissions,
  p2_publication_receipts
FROM PUBLIC, jev_public_reader, jev_public_ingest, jev_worker, jev_operator;

REVOKE ALL ON SEQUENCE
  p2_registry_events_seq_seq, p2_cohort_events_seq_seq, p2_publication_receipts_seq_seq
FROM PUBLIC, jev_public_reader, jev_public_ingest, jev_worker, jev_operator;

REVOKE ALL ON FUNCTION p2_canonical_json(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_sha256_hex(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_invalid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_assert_keys(text, jsonb, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_text(jsonb, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_timestamp(jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_integer(jsonb, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_verify_envelope(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_command_request_hash(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_registry_entry_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_cohort_lifecycle_event(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_cohort_status(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_registry_root_hash(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_admission_manifest_hash(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_registry_entry() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_registry_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_cohort() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_assert_cohort_complete(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_check_cohort_complete() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_cohort_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_source_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_evidence_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_evidence_admission() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_assert_evidence_state_complete(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_check_evidence_state_complete() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_validate_publication_receipt() FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_accept_operator_command(jsonb, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_assert_command_replay(text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_registry_entry(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_registry_event(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_cohort(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_cohort_event(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_rejected_operator_command(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_record_first_forecast_lock(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_source_revision(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_evidence_state(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_append_publication_receipt(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_read_registry_entry_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_read_cohort_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_read_source_revisions_as_of(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_read_evidence_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2_read_receipt_authority(text) FROM PUBLIC;

-- The public reader and public ingest roles receive no Phase Two capability
-- until the public-mode gate approves a rights-cleared projection.
GRANT EXECUTE ON FUNCTION p2_append_registry_entry(jsonb, jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_registry_event(jsonb, jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_cohort(jsonb, jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_cohort_event(jsonb, jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_append_rejected_operator_command(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION p2_record_first_forecast_lock(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_append_source_revision(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_append_evidence_state(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_append_publication_receipt(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_read_registry_entry_status(text) TO jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION p2_read_cohort_status(text) TO jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION p2_read_source_revisions_as_of(text, timestamptz) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_read_evidence_state(text) TO jev_worker;
GRANT EXECUTE ON FUNCTION p2_read_receipt_authority(text) TO jev_worker, jev_operator;

COMMIT;
