BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE symbols (
  symbol text PRIMARY KEY CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
  exchange text NOT NULL CHECK (exchange <> ''),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  benchmark_symbol text NOT NULL CHECK (benchmark_symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE provider_rights (
  id text PRIMARY KEY CHECK (id <> ''),
  provider text NOT NULL CHECK (provider <> ''),
  plan_or_contract text NOT NULL CHECK (plan_or_contract <> ''),
  permitted_fields text[] NOT NULL CHECK (cardinality(permitted_fields) > 0),
  audience text NOT NULL CHECK (audience IN ('private', 'public')),
  retention text NOT NULL CHECK (retention <> ''),
  attribution text NOT NULL CHECK (attribution <> ''),
  derived_outputs boolean NOT NULL,
  screenshots_and_video boolean NOT NULL,
  onward_ai_processing boolean NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  reviewed_by text NOT NULL CHECK (reviewed_by <> ''),
  evidence_hash char(64) NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX provider_rights_effective_idx
  ON provider_rights (provider, effective_from DESC);

CREATE TABLE processor_terms (
  id text PRIMARY KEY CHECK (id <> ''),
  processor text NOT NULL CHECK (processor <> ''),
  retention text NOT NULL CHECK (retention <> ''),
  training text NOT NULL CHECK (training <> ''),
  residency text NOT NULL CHECK (residency <> ''),
  deletion text NOT NULL CHECK (deletion <> ''),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  reviewed_by text NOT NULL CHECK (reviewed_by <> ''),
  evidence_hash char(64) NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX processor_terms_effective_idx
  ON processor_terms (processor, effective_from DESC);

CREATE TABLE market_bars (
  id text PRIMARY KEY CHECK (id <> ''),
  symbol text NOT NULL REFERENCES symbols(symbol),
  provider text NOT NULL CHECK (provider <> ''),
  session_date date NOT NULL,
  source_id text NOT NULL CHECK (source_id <> ''),
  source_revision text NOT NULL CHECK (source_revision <> ''),
  source_available_at timestamptz NOT NULL,
  unadjusted_open numeric NOT NULL CHECK (unadjusted_open > 0 AND unadjusted_open::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  unadjusted_high numeric NOT NULL CHECK (unadjusted_high > 0 AND unadjusted_high::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  unadjusted_low numeric NOT NULL CHECK (unadjusted_low > 0 AND unadjusted_low::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  unadjusted_close numeric NOT NULL CHECK (unadjusted_close > 0 AND unadjusted_close::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  adjusted_open numeric NOT NULL CHECK (adjusted_open > 0 AND adjusted_open::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  adjusted_high numeric NOT NULL CHECK (adjusted_high > 0 AND adjusted_high::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  adjusted_low numeric NOT NULL CHECK (adjusted_low > 0 AND adjusted_low::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  adjusted_close numeric NOT NULL CHECK (adjusted_close > 0 AND adjusted_close::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  volume numeric NOT NULL CHECK (volume >= 0 AND volume::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  corporate_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (provider, symbol, session_date, source_revision),
  CHECK (unadjusted_high >= GREATEST(unadjusted_open, unadjusted_close, unadjusted_low)),
  CHECK (unadjusted_low <= LEAST(unadjusted_open, unadjusted_close, unadjusted_high)),
  CHECK (adjusted_high >= GREATEST(adjusted_open, adjusted_close, adjusted_low)),
  CHECK (adjusted_low <= LEAST(adjusted_open, adjusted_close, adjusted_high))
);

CREATE TABLE market_snapshots (
  id text PRIMARY KEY CHECK (id <> ''),
  symbol text NOT NULL REFERENCES symbols(symbol),
  provider text NOT NULL CHECK (provider <> ''),
  cutoff_at timestamptz NOT NULL,
  knowledge_cutoff_at timestamptz NOT NULL,
  provider_fetched_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  latest_market_session date NOT NULL,
  source_manifest jsonb NOT NULL,
  canonical_state jsonb NOT NULL,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (cutoff_at <= knowledge_cutoff_at),
  CHECK (provider_fetched_at <= knowledge_cutoff_at),
  CHECK (source_updated_at <= knowledge_cutoff_at),
  CHECK (source_updated_at <= provider_fetched_at),
  CHECK (jsonb_typeof(source_manifest) = 'array')
);

CREATE TABLE snapshot_bar_refs (
  snapshot_id text NOT NULL REFERENCES market_snapshots(id),
  bar_id text NOT NULL REFERENCES market_bars(id),
  role text NOT NULL CHECK (role IN ('symbol', 'benchmark', 'outcome')),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (snapshot_id, role, ordinal),
  UNIQUE (snapshot_id, bar_id, role)
);

CREATE TABLE evidence_descriptors (
  id text PRIMARY KEY CHECK (id <> ''),
  snapshot_id text NOT NULL REFERENCES market_snapshots(id),
  source_id text NOT NULL CHECK (source_id <> ''),
  source_revision text NOT NULL CHECK (source_revision <> ''),
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  available_at timestamptz NOT NULL,
  descriptor jsonb NOT NULL,
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (snapshot_id, source_id, source_revision, source_hash, available_at, content_hash)
);

CREATE TABLE judgment_runs (
  id text PRIMARY KEY CHECK (id <> ''),
  snapshot_id text NOT NULL REFERENCES market_snapshots(id),
  provider text NOT NULL CHECK (provider <> ''),
  model_version text NOT NULL CHECK (model_version <> ''),
  question_version text NOT NULL CHECK (question_version <> ''),
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  typed_response jsonb,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  error_code text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (completed_at >= started_at),
  CHECK (
    (status = 'succeeded' AND typed_response IS NOT NULL AND content_hash IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND typed_response IS NULL AND error_code IS NOT NULL)
  )
);

CREATE TABLE judgment_answers (
  id text PRIMARY KEY CHECK (id <> ''),
  judgment_id text NOT NULL REFERENCES judgment_runs(id),
  answer_id text NOT NULL CHECK (answer_id <> ''),
  primitive text NOT NULL CHECK (primitive IN ('choice', 'score')),
  selected_option text NOT NULL CHECK (selected_option <> ''),
  distribution jsonb NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (judgment_id, answer_id)
);

CREATE TABLE policy_decisions (
  id text PRIMARY KEY CHECK (id <> ''),
  judgment_id text NOT NULL UNIQUE REFERENCES judgment_runs(id),
  policy_version text NOT NULL CHECK (policy_version <> ''),
  action text NOT NULL CHECK (action IN ('enter', 'hold', 'exit', 'wait', 'up', 'flat', 'down', 'pass')),
  gate_trace jsonb NOT NULL,
  sizing jsonb,
  canonical_payload text NOT NULL CHECK (canonical_payload <> ''),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE forecasts (
  id text PRIMARY KEY CHECK (id <> ''),
  publication_key text NOT NULL UNIQUE CHECK (publication_key <> ''),
  snapshot_id text NOT NULL REFERENCES market_snapshots(id),
  judgment_id text NOT NULL UNIQUE REFERENCES judgment_runs(id),
  policy_decision_id text NOT NULL REFERENCES policy_decisions(id),
  symbol text NOT NULL REFERENCES symbols(symbol),
  mode text NOT NULL CHECK (mode IN ('position', 'sprint')),
  horizon_sessions integer NOT NULL CHECK (horizon_sessions > 0),
  cutoff_at timestamptz NOT NULL,
  latest_market_session date NOT NULL,
  model_version text NOT NULL CHECK (model_version <> ''),
  question_version text NOT NULL CHECK (question_version <> ''),
  policy_version text NOT NULL CHECK (policy_version <> ''),
  deployment_sha text NOT NULL CHECK (deployment_sha <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (latest_market_session <= cutoff_at::date)
);

CREATE TABLE forecast_events (
  id text PRIMARY KEY CHECK (id <> ''),
  forecast_id text NOT NULL REFERENCES forecasts(id),
  event_type text NOT NULL CHECK (event_type IN ('published', 'resolved', 'void', 'correction')),
  reason text,
  references_event_id text REFERENCES forecast_events(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((event_type = 'published' AND reason IS NULL) OR (event_type <> 'published' AND reason <> '')),
  CHECK ((event_type = 'correction') = (references_event_id IS NOT NULL))
);

CREATE UNIQUE INDEX forecast_one_publication_idx
  ON forecast_events (forecast_id) WHERE event_type = 'published';
CREATE UNIQUE INDEX forecast_one_terminal_idx
  ON forecast_events (forecast_id) WHERE event_type IN ('resolved', 'void');
CREATE INDEX forecast_events_timeline_idx
  ON forecast_events (forecast_id, created_at, id);

CREATE TABLE forecast_outcomes (
  id text PRIMARY KEY CHECK (id <> ''),
  forecast_id text NOT NULL REFERENCES forecasts(id),
  realized_label text NOT NULL CHECK (realized_label IN ('up', 'flat', 'down')),
  adjusted_return numeric NOT NULL CHECK (adjusted_return::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  brier_score numeric CHECK (brier_score >= 0 AND brier_score::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  log_loss numeric CHECK (log_loss >= 0 AND log_loss::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  source_bar_hash char(64) NOT NULL CHECK (source_bar_hash ~ '^[a-f0-9]{64}$'),
  correction_of_outcome_id text REFERENCES forecast_outcomes(id),
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((correction_of_outcome_id IS NULL) = (correction_reason IS NULL))
);

CREATE UNIQUE INDEX forecast_one_original_outcome_idx
  ON forecast_outcomes (forecast_id) WHERE correction_of_outcome_id IS NULL;
CREATE UNIQUE INDEX forecast_outcome_one_correction_idx
  ON forecast_outcomes (correction_of_outcome_id) WHERE correction_of_outcome_id IS NOT NULL;

CREATE TABLE paper_events (
  id text PRIMARY KEY CHECK (id <> ''),
  forecast_id text REFERENCES forecasts(id),
  event_type text NOT NULL CHECK (event_type IN (
    'deposit', 'entry', 'mark', 'split', 'cash_dividend', 'stop', 'exit', 'expiry', 'correction', 'void'
  )),
  symbol text REFERENCES symbols(symbol),
  cash_delta numeric NOT NULL CHECK (cash_delta::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  shares_delta numeric NOT NULL CHECK (shares_delta::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  price numeric CHECK (price > 0 AND price::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  correction_of_event_id text REFERENCES paper_events(id),
  reason text,
  source_hash char(64) CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (shares_delta = 0 OR symbol IS NOT NULL),
  CHECK ((event_type = 'correction') = (correction_of_event_id IS NOT NULL))
);

CREATE INDEX paper_events_timeline_idx ON paper_events (created_at, id);
CREATE INDEX paper_events_symbol_idx ON paper_events (symbol, created_at, id);

CREATE TABLE job_operations (
  id text PRIMARY KEY CHECK (id <> ''),
  operation_key text NOT NULL UNIQUE CHECK (operation_key <> ''),
  operation_type text NOT NULL CHECK (operation_type IN ('snapshot', 'judgment', 'publication', 'resolution', 'portfolio', 'attestation')),
  replay_of_operation_id text REFERENCES job_operations(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE job_attempts (
  id text PRIMARY KEY CHECK (id <> ''),
  operation_id text NOT NULL REFERENCES job_operations(id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (operation_id, attempt_number)
);

CREATE TABLE job_attempt_events (
  id text PRIMARY KEY CHECK (id <> ''),
  attempt_id text NOT NULL REFERENCES job_attempts(id),
  status text NOT NULL CHECK (status IN ('scheduled', 'evaluating', 'succeeded', 'failed')),
  error_code text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status = 'failed') = (error_code IS NOT NULL))
);

CREATE UNIQUE INDEX job_attempt_one_status_idx ON job_attempt_events (attempt_id, status);
CREATE UNIQUE INDEX job_attempt_one_terminal_idx
  ON job_attempt_events (attempt_id) WHERE status IN ('succeeded', 'failed');
CREATE INDEX job_attempt_timeline_idx ON job_attempt_events (attempt_id, created_at, id);

CREATE TABLE ledger_roots (
  id text PRIMARY KEY CHECK (id <> ''),
  batch_key text NOT NULL UNIQUE CHECK (batch_key <> ''),
  root_hash char(64) NOT NULL CHECK (root_hash ~ '^[a-f0-9]{64}$'),
  previous_root_hash char(64) CHECK (previous_root_hash ~ '^[a-f0-9]{64}$'),
  attestation_deadline timestamptz NOT NULL,
  artifact_url text,
  attestation_url text,
  attested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (attested_at IS NULL OR attested_at <= attestation_deadline)
);

CREATE TABLE private_identifiers (
  id text PRIMARY KEY CHECK (id <> ''),
  identifier_kind text NOT NULL CHECK (identifier_kind IN ('visitor_pick', 'analytics')),
  token_digest char(64) NOT NULL CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  scope_key text NOT NULL CHECK (scope_key <> ''),
  record_id text NOT NULL CHECK (record_id <> ''),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (identifier_kind, token_digest, scope_key),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days')
);

CREATE INDEX private_identifiers_expiry_idx ON private_identifiers (expires_at);

CREATE TABLE visitor_picks (
  id text PRIMARY KEY CHECK (id <> ''),
  forecast_id text NOT NULL REFERENCES forecasts(id),
  choice text NOT NULL CHECK (choice IN ('up', 'flat', 'down')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE visitor_pick_results (
  id text PRIMARY KEY CHECK (id <> ''),
  visitor_pick_id text NOT NULL UNIQUE REFERENCES visitor_picks(id),
  outcome_id text NOT NULL REFERENCES forecast_outcomes(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE analytics_events (
  id text PRIMARY KEY CHECK (id <> ''),
  event_name text NOT NULL CHECK (event_name IN ('stock_view', 'pick', 'reveal', 'return', 'share')),
  symbol text,
  forecast_id text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (symbol IS NULL OR symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$')
);

CREATE INDEX analytics_aggregate_idx ON analytics_events (occurred_on, event_name, symbol);

CREATE TABLE identifier_expiry_runs (
  id text PRIMARY KEY CHECK (id <> ''),
  cutoff_at timestamptz NOT NULL,
  purged_count integer NOT NULL CHECK (purged_count >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%s is append-only; %s is forbidden', TG_TABLE_NAME, TG_OP);
END
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'provider_rights', 'processor_terms', 'market_bars', 'market_snapshots',
    'snapshot_bar_refs', 'evidence_descriptors', 'judgment_runs', 'judgment_answers',
    'policy_decisions', 'forecasts', 'forecast_events', 'forecast_outcomes',
    'paper_events', 'job_operations', 'job_attempts', 'job_attempt_events',
    'ledger_roots', 'visitor_picks', 'visitor_pick_results', 'analytics_events',
    'identifier_expiry_runs'
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

CREATE FUNCTION validate_forecast_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  publication_count integer;
  terminal_count integer;
  referenced_forecast text;
BEGIN
  SELECT count(*) FILTER (WHERE event_type = 'published'),
         count(*) FILTER (WHERE event_type IN ('resolved', 'void'))
    INTO publication_count, terminal_count
    FROM forecast_events
    WHERE forecast_id = NEW.forecast_id;

  IF NEW.event_type = 'published' THEN
    IF publication_count <> 0 OR terminal_count <> 0 THEN
      RAISE EXCEPTION 'forecast % is already published', NEW.forecast_id;
    END IF;
  ELSIF NEW.event_type IN ('resolved', 'void') THEN
    IF publication_count <> 1 OR terminal_count <> 0 THEN
      RAISE EXCEPTION 'invalid terminal transition for forecast %', NEW.forecast_id;
    END IF;
  ELSE
    IF publication_count <> 1 OR terminal_count <> 1 THEN
      RAISE EXCEPTION 'forecast % cannot be corrected before a terminal event', NEW.forecast_id;
    END IF;
    SELECT forecast_id INTO referenced_forecast
      FROM forecast_events WHERE id = NEW.references_event_id;
    IF referenced_forecast IS DISTINCT FROM NEW.forecast_id THEN
      RAISE EXCEPTION 'correction must reference an event from forecast %', NEW.forecast_id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER forecast_event_lifecycle
  BEFORE INSERT ON forecast_events
  FOR EACH ROW EXECUTE FUNCTION validate_forecast_event();

CREATE FUNCTION validate_forecast_dependencies()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  judgment_snapshot_id text;
  judgment_model_version text;
  judgment_question_version text;
  judgment_status text;
  decision_judgment_id text;
  decision_policy_version text;
  snapshot_symbol text;
  snapshot_cutoff timestamptz;
  snapshot_session date;
BEGIN
  SELECT snapshot_id, model_version, question_version, status
    INTO judgment_snapshot_id, judgment_model_version, judgment_question_version, judgment_status
    FROM judgment_runs WHERE id = NEW.judgment_id;
  SELECT judgment_id, policy_version
    INTO decision_judgment_id, decision_policy_version
    FROM policy_decisions WHERE id = NEW.policy_decision_id;
  SELECT symbol, cutoff_at, latest_market_session
    INTO snapshot_symbol, snapshot_cutoff, snapshot_session
    FROM market_snapshots WHERE id = NEW.snapshot_id;

  IF judgment_status IS DISTINCT FROM 'succeeded'
    OR judgment_snapshot_id IS DISTINCT FROM NEW.snapshot_id
    OR decision_judgment_id IS DISTINCT FROM NEW.judgment_id
    OR snapshot_symbol IS DISTINCT FROM NEW.symbol
    OR snapshot_cutoff IS DISTINCT FROM NEW.cutoff_at
    OR snapshot_session IS DISTINCT FROM NEW.latest_market_session
    OR judgment_model_version IS DISTINCT FROM NEW.model_version
    OR judgment_question_version IS DISTINCT FROM NEW.question_version
    OR decision_policy_version IS DISTINCT FROM NEW.policy_version
  THEN
    RAISE EXCEPTION 'forecast dependencies or immutable versions do not match';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER forecast_dependency_match
  BEFORE INSERT ON forecasts
  FOR EACH ROW EXECUTE FUNCTION validate_forecast_dependencies();

CREATE FUNCTION validate_market_snapshot_sources()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF jsonb_array_length(NEW.source_manifest) = 0 OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.source_manifest) source
    WHERE NULLIF(source->>'sourceId', '') IS NULL
      OR NULLIF(source->>'sourceRevision', '') IS NULL
      OR COALESCE(source->>'sourceHash', '') !~ '^[a-f0-9]{64}$'
      OR NULLIF(source->>'availableAt', '') IS NULL
      OR (source->>'availableAt')::timestamptz > NEW.knowledge_cutoff_at
      OR (source->>'availableAt')::timestamptz > NEW.provider_fetched_at
  ) THEN
    RAISE EXCEPTION 'snapshot source manifest contains unavailable or invalid provenance';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.source_manifest) source
    GROUP BY source->>'sourceId', source->>'sourceRevision'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'snapshot source manifest contains duplicate source versions';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER market_snapshot_source_cutoff
  BEFORE INSERT ON market_snapshots
  FOR EACH ROW EXECUTE FUNCTION validate_market_snapshot_sources();

CREATE FUNCTION validate_snapshot_bar_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_provider text;
  knowledge_cutoff timestamptz;
  provider_fetched timestamptz;
  snapshot_manifest jsonb;
  bar_provider text;
  bar_available_at timestamptz;
  bar_source_id text;
  bar_source_revision text;
  bar_source_hash text;
BEGIN
  SELECT provider, knowledge_cutoff_at, provider_fetched_at, source_manifest
    INTO snapshot_provider, knowledge_cutoff, provider_fetched, snapshot_manifest
    FROM market_snapshots WHERE id = NEW.snapshot_id;
  SELECT provider, source_available_at, source_id, source_revision, source_hash
    INTO bar_provider, bar_available_at, bar_source_id, bar_source_revision, bar_source_hash
    FROM market_bars WHERE id = NEW.bar_id;

  IF snapshot_provider IS DISTINCT FROM bar_provider THEN
    RAISE EXCEPTION 'snapshot and bar providers do not match';
  END IF;
  IF bar_available_at > knowledge_cutoff OR bar_available_at > provider_fetched THEN
    RAISE EXCEPTION 'bar revision was unavailable when the snapshot was fetched';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(snapshot_manifest) source
    WHERE source->>'sourceId' = bar_source_id
      AND source->>'sourceRevision' = bar_source_revision
      AND source->>'sourceHash' = bar_source_hash
      AND (source->>'availableAt')::timestamptz = bar_available_at
  ) THEN
    RAISE EXCEPTION 'referenced bar provenance is absent from the snapshot manifest';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER snapshot_bar_reference_cutoff
  BEFORE INSERT ON snapshot_bar_refs
  FOR EACH ROW EXECUTE FUNCTION validate_snapshot_bar_reference();

CREATE FUNCTION validate_forecast_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  corrected_forecast text;
  already_corrected boolean;
BEGIN
  IF NEW.correction_of_outcome_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM forecast_events
      WHERE forecast_id = NEW.forecast_id AND event_type = 'resolved'
    ) THEN
      RAISE EXCEPTION 'forecast % must be resolved before recording an outcome', NEW.forecast_id;
    END IF;
    IF EXISTS (SELECT 1 FROM forecast_outcomes WHERE forecast_id = NEW.forecast_id) THEN
      RAISE EXCEPTION 'forecast % already has an outcome', NEW.forecast_id;
    END IF;
  ELSE
    SELECT forecast_id INTO corrected_forecast
      FROM forecast_outcomes WHERE id = NEW.correction_of_outcome_id;
    SELECT EXISTS(
      SELECT 1 FROM forecast_outcomes
      WHERE correction_of_outcome_id = NEW.correction_of_outcome_id
    ) INTO already_corrected;
    IF corrected_forecast IS DISTINCT FROM NEW.forecast_id OR already_corrected THEN
      RAISE EXCEPTION 'outcome correction must extend the active chain';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER forecast_outcome_chain
  BEFORE INSERT ON forecast_outcomes
  FOR EACH ROW EXECUTE FUNCTION validate_forecast_outcome();

CREATE FUNCTION validate_job_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous_attempt integer;
  previous_status text;
BEGIN
  PERFORM 1 FROM job_operations WHERE id = NEW.operation_id FOR UPDATE;

  SELECT attempt.attempt_number, event.status
    INTO previous_attempt, previous_status
    FROM job_attempts attempt
    JOIN LATERAL (
      SELECT status
      FROM job_attempt_events
      WHERE attempt_id = attempt.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) event ON true
    WHERE attempt.operation_id = NEW.operation_id
    ORDER BY attempt.attempt_number DESC
    LIMIT 1;

  IF previous_attempt IS NULL AND NEW.attempt_number <> 1 THEN
    RAISE EXCEPTION 'the first job attempt must be attempt 1';
  ELSIF previous_status = 'succeeded' THEN
    RAISE EXCEPTION 'a succeeded operation cannot be retried';
  ELSIF previous_attempt IS NOT NULL AND previous_status <> 'failed' THEN
    RAISE EXCEPTION 'a retry requires a terminal failed attempt';
  ELSIF previous_attempt IS NOT NULL
    AND NEW.attempt_number <> previous_attempt + 1
  THEN
    RAISE EXCEPTION 'retry attempt numbers must be contiguous';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER job_attempt_lifecycle
  BEFORE INSERT ON job_attempts
  FOR EACH ROW EXECUTE FUNCTION validate_job_attempt();

CREATE FUNCTION validate_job_attempt_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status text;
BEGIN
  PERFORM 1 FROM job_attempts WHERE id = NEW.attempt_id FOR UPDATE;
  SELECT status INTO current_status
    FROM job_attempt_events
    WHERE attempt_id = NEW.attempt_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
  IF current_status IS NULL AND NEW.status <> 'scheduled' THEN
    RAISE EXCEPTION 'job attempt must begin scheduled';
  ELSIF current_status = 'scheduled' AND NEW.status <> 'evaluating' THEN
    RAISE EXCEPTION 'scheduled job attempt must move to evaluating';
  ELSIF current_status = 'evaluating' AND NEW.status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'evaluating job attempt must become terminal';
  ELSIF current_status IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'terminal job attempt cannot move backward';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER job_attempt_event_lifecycle
  BEFORE INSERT ON job_attempt_events
  FOR EACH ROW EXECUTE FUNCTION validate_job_attempt_event();

CREATE VIEW forecast_current_states AS
SELECT
  f.id AS forecast_id,
  f.symbol,
  f.mode,
  f.horizon_sessions,
  f.cutoff_at,
  terminal.event_type AS terminal_status,
  COALESCE(terminal.event_type, 'published') AS status
FROM forecasts f
LEFT JOIN LATERAL (
  SELECT event_type
  FROM forecast_events e
  WHERE e.forecast_id = f.id AND e.event_type IN ('resolved', 'void')
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 1
) terminal ON true;

CREATE VIEW active_forecast_outcomes AS
SELECT outcome.*
FROM forecast_outcomes outcome
WHERE NOT EXISTS (
  SELECT 1 FROM forecast_outcomes correction
  WHERE correction.correction_of_outcome_id = outcome.id
);

CREATE VIEW visitor_pick_current_results AS
SELECT
  result.id,
  result.visitor_pick_id,
  result.outcome_id AS recorded_outcome_id,
  active.id AS active_outcome_id,
  (pick.choice = active.realized_label) AS correct,
  result.created_at
FROM visitor_pick_results result
JOIN visitor_picks pick ON pick.id = result.visitor_pick_id
JOIN active_forecast_outcomes active ON active.forecast_id = pick.forecast_id;

CREATE VIEW paper_position_projection AS
SELECT
  symbol,
  sum(shares_delta) AS shares,
  sum(cash_delta) AS cash_delta
FROM paper_events
GROUP BY symbol;

CREATE VIEW analytics_aggregate AS
SELECT occurred_on, event_name, symbol, count(*)::bigint AS event_count
FROM analytics_events
GROUP BY occurred_on, event_name, symbol;

CREATE FUNCTION read_public_forecasts()
RETURNS TABLE (
  forecast_id text,
  symbol text,
  mode text,
  horizon_sessions integer,
  cutoff_at timestamptz,
  latest_market_session date,
  provider text,
  model_version text,
  question_version text,
  policy_version text,
  status text,
  realized_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
SELECT
  forecast.id,
  forecast.symbol,
  forecast.mode,
  forecast.horizon_sessions,
  forecast.cutoff_at,
  forecast.latest_market_session,
  snapshot.provider,
  forecast.model_version,
  forecast.question_version,
  forecast.policy_version,
  state.status,
  outcome.realized_label
FROM forecasts forecast
JOIN market_snapshots snapshot ON snapshot.id = forecast.snapshot_id
JOIN judgment_runs judgment ON judgment.id = forecast.judgment_id
JOIN forecast_current_states state ON state.forecast_id = forecast.id
LEFT JOIN active_forecast_outcomes outcome ON outcome.forecast_id = forecast.id
WHERE EXISTS (
  SELECT 1
  FROM provider_rights rights
  WHERE rights.provider = snapshot.provider
    AND rights.audience = 'public'
    AND rights.effective_from <= statement_timestamp()
    AND (rights.effective_to IS NULL OR statement_timestamp() < rights.effective_to)
    AND ARRAY[
      'daily_ohlcv', 'corporate_actions', 'exchange_calendar',
      'structured_events'
    ]::text[] <@ rights.permitted_fields
    AND rights.plan_or_contract <> ''
    AND rights.retention <> ''
    AND rights.attribution <> ''
    AND rights.derived_outputs
    AND rights.screenshots_and_video
    AND rights.onward_ai_processing
    AND rights.reviewed_by <> ''
)
AND EXISTS (
  SELECT 1
  FROM processor_terms terms
  WHERE terms.processor = 'openrouter-jev'
    AND judgment.provider = 'openrouter'
    AND terms.effective_from <= statement_timestamp()
    AND (terms.effective_to IS NULL OR statement_timestamp() < terms.effective_to)
    AND terms.retention <> ''
    AND terms.training <> ''
    AND terms.residency <> ''
    AND terms.deletion <> ''
    AND terms.reviewed_by <> ''
)
$$;

CREATE FUNCTION assert_json_number(
  p_record jsonb,
  p_field text,
  p_nullable boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  value jsonb := p_record->p_field;
  parsed numeric;
BEGIN
  IF value IS NULL OR value = 'null'::jsonb THEN
    IF p_nullable THEN RETURN NULL; END IF;
    RAISE EXCEPTION '% must be a JSON number', p_field;
  END IF;
  IF jsonb_typeof(value) <> 'number' THEN
    RAISE EXCEPTION '% must be a JSON number', p_field;
  END IF;
  parsed := (value #>> '{}')::numeric;
  IF parsed::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION '% must be finite', p_field;
  END IF;
  RETURN parsed;
END
$$;

CREATE FUNCTION verify_ledger_content_hash(
  p_kind text,
  p_canonical_payload text,
  p_content_hash text,
  p_expected_payload jsonb
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
    'recipe', 'jev-ledger-canonical-json/v1',
    'kind', p_kind,
    'payload', p_expected_payload
  ) THEN
    RAISE EXCEPTION 'canonical payload does not match immutable fields';
  END IF;
  actual_hash := encode(digest(convert_to(p_canonical_payload, 'UTF8'), 'sha256'), 'hex');
  IF actual_hash IS DISTINCT FROM p_content_hash THEN
    RAISE EXCEPTION 'content hash does not match canonical payload';
  END IF;
END
$$;

CREATE FUNCTION public_mode_gate(
  p_at timestamptz,
  p_expected_provider text,
  p_expected_processor text,
  p_required_fields text[]
)
RETURNS TABLE (allowed boolean, blockers text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
WITH gates AS (
  SELECT
    EXISTS (
      SELECT 1 FROM provider_rights
      WHERE provider = p_expected_provider
        AND audience = 'public'
        AND effective_from <= p_at
        AND (effective_to IS NULL OR p_at < effective_to)
        AND cardinality(p_required_fields) > 0
        AND p_required_fields <@ permitted_fields
        AND derived_outputs
        AND screenshots_and_video
        AND onward_ai_processing
    ) AS has_rights,
    EXISTS (
      SELECT 1 FROM processor_terms
      WHERE processor = p_expected_processor
        AND effective_from <= p_at
        AND (effective_to IS NULL OR p_at < effective_to)
    ) AS has_processor_terms
)
SELECT
  has_rights AND has_processor_terms,
  array_remove(ARRAY[
    CASE WHEN NOT has_rights THEN 'PROVIDER_RIGHTS_MISSING' END,
    CASE WHEN NOT has_processor_terms THEN 'PROCESSOR_TERMS_MISSING' END
  ], NULL)
FROM gates
$$;

CREATE FUNCTION publish_forecast(p_forecast jsonb, p_publication_event_id text)
RETURNS TABLE (created boolean, forecast_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  inserted_id text;
  existing_forecast forecasts%ROWTYPE;
  existing_publication_event_id text;
BEGIN
  INSERT INTO forecasts (
    id, publication_key, snapshot_id, judgment_id, policy_decision_id, symbol,
    mode, horizon_sessions, cutoff_at, latest_market_session, model_version,
    question_version, policy_version, deployment_sha
  ) VALUES (
    p_forecast->>'id', p_forecast->>'publicationKey', p_forecast->>'snapshotId',
    p_forecast->>'judgmentId', NULLIF(p_forecast->>'policyDecisionId', ''),
    p_forecast->>'symbol', p_forecast->>'mode',
    (p_forecast->>'horizonSessions')::integer,
    (p_forecast->>'cutoffAt')::timestamptz,
    (p_forecast->>'latestMarketSession')::date,
    p_forecast->>'modelVersion', p_forecast->>'questionVersion',
    p_forecast->>'policyVersion', p_forecast->>'deploymentSha'
  )
  ON CONFLICT (publication_key) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    SELECT * INTO existing_forecast FROM forecasts
      WHERE publication_key = p_forecast->>'publicationKey';
    SELECT event.id INTO existing_publication_event_id
      FROM forecast_events event
      WHERE event.forecast_id = existing_forecast.id
        AND event.event_type = 'published';

    IF existing_forecast.id IS DISTINCT FROM p_forecast->>'id'
      OR existing_forecast.snapshot_id IS DISTINCT FROM p_forecast->>'snapshotId'
      OR existing_forecast.judgment_id IS DISTINCT FROM p_forecast->>'judgmentId'
      OR existing_forecast.policy_decision_id IS DISTINCT FROM p_forecast->>'policyDecisionId'
      OR existing_forecast.symbol IS DISTINCT FROM p_forecast->>'symbol'
      OR existing_forecast.mode IS DISTINCT FROM p_forecast->>'mode'
      OR existing_forecast.horizon_sessions IS DISTINCT FROM (p_forecast->>'horizonSessions')::integer
      OR existing_forecast.cutoff_at IS DISTINCT FROM (p_forecast->>'cutoffAt')::timestamptz
      OR existing_forecast.latest_market_session IS DISTINCT FROM (p_forecast->>'latestMarketSession')::date
      OR existing_forecast.model_version IS DISTINCT FROM p_forecast->>'modelVersion'
      OR existing_forecast.question_version IS DISTINCT FROM p_forecast->>'questionVersion'
      OR existing_forecast.policy_version IS DISTINCT FROM p_forecast->>'policyVersion'
      OR existing_forecast.deployment_sha IS DISTINCT FROM p_forecast->>'deploymentSha'
      OR existing_publication_event_id IS DISTINCT FROM p_publication_event_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'publication key conflicts with a different immutable payload';
    END IF;

    RETURN QUERY SELECT false, existing_forecast.id;
    RETURN;
  END IF;

  INSERT INTO forecast_events (id, forecast_id, event_type)
  VALUES (p_publication_event_id, inserted_id, 'published');
  RETURN QUERY SELECT true, inserted_id;
END
$$;

CREATE FUNCTION upsert_symbol(p_symbol jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO symbols (symbol, exchange, currency, benchmark_symbol, enabled)
  VALUES (
    p_symbol->>'symbol', p_symbol->>'exchange', p_symbol->>'currency',
    p_symbol->>'benchmarkSymbol', (p_symbol->>'enabled')::boolean
  )
  ON CONFLICT (symbol) DO UPDATE SET
    exchange = EXCLUDED.exchange,
    currency = EXCLUDED.currency,
    benchmark_symbol = EXCLUDED.benchmark_symbol,
    enabled = EXCLUDED.enabled,
    updated_at = clock_timestamp();
  RETURN p_symbol->>'symbol';
END
$$;

CREATE FUNCTION append_provider_rights(p_record jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO provider_rights (
    id, provider, plan_or_contract, permitted_fields, audience, retention,
    attribution, derived_outputs, screenshots_and_video,
    onward_ai_processing, effective_from, effective_to, reviewed_by,
    evidence_hash
  ) VALUES (
    p_record->>'id', p_record->>'provider', p_record->>'planOrContract',
    ARRAY(SELECT jsonb_array_elements_text(p_record->'permittedFields')),
    p_record->>'audience', p_record->>'retention', p_record->>'attribution',
    (p_record->>'derivedOutputs')::boolean,
    (p_record->>'screenshotsAndVideo')::boolean,
    (p_record->>'onwardAiProcessing')::boolean,
    (p_record->>'effectiveFrom')::timestamptz,
    (p_record->>'effectiveTo')::timestamptz,
    p_record->>'reviewedBy', p_record->>'evidenceHash'
  );
  RETURN p_record->>'id';
END
$$;

CREATE FUNCTION append_processor_terms(p_record jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO processor_terms (
    id, processor, retention, training, residency, deletion, effective_from,
    effective_to, reviewed_by, evidence_hash
  ) VALUES (
    p_record->>'id', p_record->>'processor', p_record->>'retention',
    p_record->>'training', p_record->>'residency', p_record->>'deletion',
    (p_record->>'effectiveFrom')::timestamptz,
    (p_record->>'effectiveTo')::timestamptz,
    p_record->>'reviewedBy', p_record->>'evidenceHash'
  );
  RETURN p_record->>'id';
END
$$;

CREATE FUNCTION append_market_bar(p_bar jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  unadjusted_open_value numeric;
  unadjusted_high_value numeric;
  unadjusted_low_value numeric;
  unadjusted_close_value numeric;
  adjusted_open_value numeric;
  adjusted_high_value numeric;
  adjusted_low_value numeric;
  adjusted_close_value numeric;
  volume_value numeric;
BEGIN
  unadjusted_open_value := assert_json_number(p_bar, 'unadjustedOpen');
  unadjusted_high_value := assert_json_number(p_bar, 'unadjustedHigh');
  unadjusted_low_value := assert_json_number(p_bar, 'unadjustedLow');
  unadjusted_close_value := assert_json_number(p_bar, 'unadjustedClose');
  adjusted_open_value := assert_json_number(p_bar, 'adjustedOpen');
  adjusted_high_value := assert_json_number(p_bar, 'adjustedHigh');
  adjusted_low_value := assert_json_number(p_bar, 'adjustedLow');
  adjusted_close_value := assert_json_number(p_bar, 'adjustedClose');
  volume_value := assert_json_number(p_bar, 'volume');
  INSERT INTO market_bars (
    id, symbol, provider, session_date, source_id, source_revision,
    source_available_at, unadjusted_open, unadjusted_high, unadjusted_low,
    unadjusted_close, adjusted_open, adjusted_high, adjusted_low,
    adjusted_close, volume, corporate_action, source_hash
  ) VALUES (
    p_bar->>'id', p_bar->>'symbol', p_bar->>'provider',
    (p_bar->>'sessionDate')::date, p_bar->>'sourceId',
    p_bar->>'sourceRevision', (p_bar->>'sourceAvailableAt')::timestamptz,
    unadjusted_open_value, unadjusted_high_value, unadjusted_low_value,
    unadjusted_close_value, adjusted_open_value, adjusted_high_value,
    adjusted_low_value, adjusted_close_value, volume_value,
    COALESCE(p_bar->'corporateAction', '{}'::jsonb), p_bar->>'sourceHash'
  );
  RETURN p_bar->>'id';
END
$$;

CREATE FUNCTION validate_snapshot_history(p_snapshot jsonb, p_bar_refs jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  benchmark_symbol_value text;
  snapshot_symbol_value text := p_snapshot->>'symbol';
  snapshot_provider_value text := p_snapshot->>'provider';
  latest_session_value date := (p_snapshot->>'latestMarketSession')::date;
  symbol_count integer;
  benchmark_count integer;
BEGIN
  SELECT benchmark_symbol INTO benchmark_symbol_value
  FROM symbols
  WHERE symbol = snapshot_symbol_value AND enabled;
  IF benchmark_symbol_value IS NULL THEN
    RAISE EXCEPTION 'snapshot symbol must be enabled in the allowlist';
  END IF;
  IF jsonb_typeof(p_bar_refs) <> 'array' THEN
    RAISE EXCEPTION 'snapshot bar references must be an array';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_bar_refs) value
    WHERE value->>'role' NOT IN ('symbol', 'benchmark')
      OR jsonb_typeof(value->'ordinal') <> 'number'
      OR (value->>'ordinal') !~ '^(0|[1-9][0-9]*)$'
  ) THEN
    RAISE EXCEPTION 'snapshot bar references have an invalid role or ordinal';
  END IF;

  WITH refs AS (
    SELECT value->>'barId' AS bar_id, value->>'role' AS role,
           (value->>'ordinal')::integer AS ordinal
    FROM jsonb_array_elements(p_bar_refs) value
  )
  SELECT count(*) FILTER (WHERE role = 'symbol'),
         count(*) FILTER (WHERE role = 'benchmark')
  INTO symbol_count, benchmark_count
  FROM refs;
  IF symbol_count < 272 OR benchmark_count < 272
    OR symbol_count <> benchmark_count
  THEN
    RAISE EXCEPTION 'snapshot requires aligned symbol and benchmark histories of at least 272 sessions';
  END IF;

  IF EXISTS (
    WITH refs AS (
      SELECT value->>'barId' AS bar_id, value->>'role' AS role,
             (value->>'ordinal')::integer AS ordinal
      FROM jsonb_array_elements(p_bar_refs) value
    )
    SELECT 1 FROM refs
    GROUP BY role, ordinal HAVING count(*) <> 1
  ) OR EXISTS (
    WITH refs AS (
      SELECT value->>'role' AS role, (value->>'ordinal')::integer AS ordinal
      FROM jsonb_array_elements(p_bar_refs) value
    )
    SELECT 1 FROM refs
    GROUP BY role
    HAVING min(ordinal) <> 0 OR max(ordinal) <> count(*) - 1
  ) THEN
    RAISE EXCEPTION 'snapshot bar ordinals must be unique and contiguous from zero';
  END IF;

  IF EXISTS (
    WITH refs AS (
      SELECT value->>'barId' AS bar_id, value->>'role' AS role,
             (value->>'ordinal')::integer AS ordinal
      FROM jsonb_array_elements(p_bar_refs) value
    )
    SELECT 1
    FROM refs
    LEFT JOIN market_bars bar ON bar.id = refs.bar_id
    WHERE bar.id IS NULL
      OR bar.provider <> snapshot_provider_value
      OR (refs.role = 'symbol' AND bar.symbol <> snapshot_symbol_value)
      OR (refs.role = 'benchmark' AND bar.symbol <> benchmark_symbol_value)
      OR bar.session_date > latest_session_value
  ) THEN
    RAISE EXCEPTION 'snapshot bar reference provider, symbol, or session is invalid';
  END IF;

  IF EXISTS (
    WITH refs AS (
      SELECT value->>'barId' AS bar_id, value->>'role' AS role,
             (value->>'ordinal')::integer AS ordinal
      FROM jsonb_array_elements(p_bar_refs) value
    ), series AS (
      SELECT refs.role, refs.ordinal, bar.session_date,
             lag(bar.session_date) OVER (PARTITION BY refs.role ORDER BY refs.ordinal) AS prior_session,
             max(refs.ordinal) OVER (PARTITION BY refs.role) AS final_ordinal
      FROM refs JOIN market_bars bar ON bar.id = refs.bar_id
    )
    SELECT 1 FROM series
    WHERE (prior_session IS NOT NULL AND session_date <= prior_session)
      OR (ordinal = final_ordinal AND session_date <> latest_session_value)
  ) THEN
    RAISE EXCEPTION 'snapshot histories must increase and end at latestMarketSession';
  END IF;

  IF EXISTS (
    WITH refs AS (
      SELECT value->>'barId' AS bar_id, value->>'role' AS role,
             (value->>'ordinal')::integer AS ordinal
      FROM jsonb_array_elements(p_bar_refs) value
    ), series AS (
      SELECT refs.role, refs.ordinal, bar.session_date
      FROM refs JOIN market_bars bar ON bar.id = refs.bar_id
    )
    SELECT 1
    FROM series symbol_series
    FULL JOIN series benchmark_series
      ON benchmark_series.role = 'benchmark'
      AND symbol_series.role = 'symbol'
      AND benchmark_series.ordinal = symbol_series.ordinal
    WHERE symbol_series.role = 'symbol'
      AND (benchmark_series.ordinal IS NULL
        OR benchmark_series.session_date <> symbol_series.session_date)
  ) THEN
    RAISE EXCEPTION 'symbol and benchmark histories must align by session and ordinal';
  END IF;
END
$$;

CREATE FUNCTION append_market_snapshot(
  p_snapshot jsonb,
  p_bar_refs jsonb,
  p_evidence jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  ref record;
  evidence record;
BEGIN
  IF jsonb_typeof(p_bar_refs) <> 'array'
    OR jsonb_typeof(p_evidence) <> 'array'
  THEN
    RAISE EXCEPTION 'snapshot references and evidence must be arrays';
  END IF;

  PERFORM validate_snapshot_history(p_snapshot, p_bar_refs);
  PERFORM verify_ledger_content_hash(
    'market_snapshot', p_snapshot->>'canonicalPayload',
    p_snapshot->>'contentHash',
    jsonb_build_object(
      'symbol', p_snapshot->>'symbol',
      'provider', p_snapshot->>'provider',
      'cutoffAt', p_snapshot->>'cutoffAt',
      'knowledgeCutoffAt', p_snapshot->>'knowledgeCutoffAt',
      'providerFetchedAt', p_snapshot->>'providerFetchedAt',
      'sourceUpdatedAt', p_snapshot->>'sourceUpdatedAt',
      'latestMarketSession', p_snapshot->>'latestMarketSession',
      'sourceManifest', p_snapshot->'sourceManifest',
      'state', p_snapshot->'state'
    )
  );
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_evidence) evidence_value
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_snapshot->'sourceManifest') source
      WHERE source->>'sourceId' = evidence_value->>'sourceId'
        AND source->>'sourceRevision' = evidence_value->>'sourceRevision'
        AND source->>'sourceHash' = evidence_value->>'sourceHash'
        AND (source->>'availableAt')::timestamptz = (evidence_value->>'availableAt')::timestamptz
    )
  ) THEN
    RAISE EXCEPTION 'evidence provenance is absent from the snapshot manifest';
  END IF;

  INSERT INTO market_snapshots (
    id, symbol, provider, cutoff_at, knowledge_cutoff_at,
    provider_fetched_at, source_updated_at, latest_market_session,
    source_manifest, canonical_state, canonical_payload, content_hash
  ) VALUES (
    p_snapshot->>'id', p_snapshot->>'symbol', p_snapshot->>'provider',
    (p_snapshot->>'cutoffAt')::timestamptz,
    (p_snapshot->>'knowledgeCutoffAt')::timestamptz,
    (p_snapshot->>'providerFetchedAt')::timestamptz,
    (p_snapshot->>'sourceUpdatedAt')::timestamptz,
    (p_snapshot->>'latestMarketSession')::date,
    p_snapshot->'sourceManifest', p_snapshot->'state',
    p_snapshot->>'canonicalPayload',
    p_snapshot->>'contentHash'
  );

  FOR ref IN
    SELECT * FROM jsonb_to_recordset(p_bar_refs)
      AS value("barId" text, role text, ordinal integer)
  LOOP
    INSERT INTO snapshot_bar_refs (snapshot_id, bar_id, role, ordinal)
    VALUES (p_snapshot->>'id', ref."barId", ref.role, ref.ordinal);
  END LOOP;

  FOR evidence IN
    SELECT * FROM jsonb_to_recordset(p_evidence)
      AS value(
        id text, "sourceId" text, "sourceRevision" text,
        "sourceHash" text, "availableAt" timestamptz,
        descriptor jsonb, "contentHash" text
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_snapshot->'sourceManifest') source
      WHERE source->>'sourceId' = evidence."sourceId"
        AND source->>'sourceRevision' = evidence."sourceRevision"
        AND source->>'sourceHash' = evidence."sourceHash"
        AND (source->>'availableAt')::timestamptz = evidence."availableAt"
    ) THEN
      RAISE EXCEPTION 'evidence source is absent from the snapshot manifest';
    END IF;
    INSERT INTO evidence_descriptors (
      id, snapshot_id, source_id, source_revision, source_hash, available_at,
      descriptor, content_hash
    ) VALUES (
      evidence.id, p_snapshot->>'id', evidence."sourceId",
      evidence."sourceRevision", evidence."sourceHash", evidence."availableAt",
      evidence.descriptor, evidence."contentHash"
    );
  END LOOP;
  RETURN p_snapshot->>'id';
END
$$;

CREATE FUNCTION append_judgment_run(p_run jsonb, p_answers jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  answer record;
BEGIN
  IF jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'judgment answers must be an array';
  END IF;
  PERFORM verify_ledger_content_hash(
    'judgment_run', p_run->>'canonicalPayload', p_run->>'contentHash',
    jsonb_build_object(
      'snapshotId', p_run->>'snapshotId',
      'provider', p_run->>'provider',
      'modelVersion', p_run->>'modelVersion',
      'questionVersion', p_run->>'questionVersion',
      'status', p_run->>'status',
      'typedResponse', COALESCE(p_run->'typedResponse', 'null'::jsonb),
      'errorCode', COALESCE(to_jsonb(p_run->>'errorCode'), 'null'::jsonb),
      'startedAt', p_run->>'startedAt',
      'completedAt', p_run->>'completedAt',
      'answers', p_answers
    )
  );
  INSERT INTO judgment_runs (
    id, snapshot_id, provider, model_version, question_version, status,
    typed_response, canonical_payload, content_hash, error_code, started_at,
    completed_at
  ) VALUES (
    p_run->>'id', p_run->>'snapshotId', p_run->>'provider',
    p_run->>'modelVersion', p_run->>'questionVersion', p_run->>'status',
    p_run->'typedResponse', p_run->>'canonicalPayload', p_run->>'contentHash',
    p_run->>'errorCode',
    (p_run->>'startedAt')::timestamptz,
    (p_run->>'completedAt')::timestamptz
  );
  FOR answer IN
    SELECT * FROM jsonb_to_recordset(p_answers)
      AS value(
        id text, "answerId" text, primitive text, "selectedOption" text,
        distribution jsonb, confidence numeric
      )
  LOOP
    INSERT INTO judgment_answers (
      id, judgment_id, answer_id, primitive, selected_option, distribution,
      confidence
    ) VALUES (
      answer.id, p_run->>'id', answer."answerId", answer.primitive,
      answer."selectedOption", answer.distribution, answer.confidence
    );
  END LOOP;
  RETURN p_run->>'id';
END
$$;

CREATE FUNCTION append_policy_decision(p_decision jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM verify_ledger_content_hash(
    'policy_decision', p_decision->>'canonicalPayload',
    p_decision->>'contentHash',
    jsonb_build_object(
      'judgmentId', p_decision->>'judgmentId',
      'policyVersion', p_decision->>'policyVersion',
      'action', p_decision->>'action',
      'gateTrace', p_decision->'gateTrace',
      'sizing', COALESCE(p_decision->'sizing', 'null'::jsonb)
    )
  );
  INSERT INTO policy_decisions (
    id, judgment_id, policy_version, action, gate_trace, sizing,
    canonical_payload, content_hash
  ) VALUES (
    p_decision->>'id', p_decision->>'judgmentId',
    p_decision->>'policyVersion', p_decision->>'action',
    p_decision->'gateTrace', p_decision->'sizing',
    p_decision->>'canonicalPayload',
    p_decision->>'contentHash'
  );
  RETURN p_decision->>'id';
END
$$;

CREATE FUNCTION resolve_forecast(p_event jsonb, p_outcome jsonb)
RETURNS TABLE (created boolean, event_id text, outcome_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing_event forecast_events%ROWTYPE;
  existing_outcome forecast_outcomes%ROWTYPE;
  adjusted_return_value numeric;
  brier_score_value numeric;
  log_loss_value numeric;
BEGIN
  IF p_event->>'type' IS DISTINCT FROM 'resolved'
    OR p_event ? 'referencesEventId'
    OR p_outcome ? 'correctionOfOutcomeId'
    OR p_outcome ? 'correctionReason'
    OR p_event->>'forecastId' IS DISTINCT FROM p_outcome->>'forecastId'
    OR NULLIF(p_event->>'reason', '') IS NULL
  THEN
    RAISE EXCEPTION 'resolution requires matching resolved event and original outcome';
  END IF;
  adjusted_return_value := assert_json_number(p_outcome, 'adjustedReturn');
  brier_score_value := assert_json_number(p_outcome, 'brierScore', true);
  log_loss_value := assert_json_number(p_outcome, 'logLoss', true);
  PERFORM 1 FROM forecasts WHERE id = p_event->>'forecastId' FOR UPDATE;

  SELECT * INTO existing_event FROM forecast_events WHERE id = p_event->>'id';
  SELECT * INTO existing_outcome FROM forecast_outcomes WHERE id = p_outcome->>'id';
  IF existing_event.id IS NOT NULL OR existing_outcome.id IS NOT NULL THEN
    IF existing_event.id IS NULL OR existing_outcome.id IS NULL
      OR existing_event.forecast_id IS DISTINCT FROM p_event->>'forecastId'
      OR existing_event.event_type IS DISTINCT FROM 'resolved'
      OR existing_event.reason IS DISTINCT FROM p_event->>'reason'
      OR existing_event.payload IS DISTINCT FROM COALESCE(p_event->'payload', '{}'::jsonb)
      OR existing_outcome.forecast_id IS DISTINCT FROM p_outcome->>'forecastId'
      OR existing_outcome.realized_label IS DISTINCT FROM p_outcome->>'realizedLabel'
      OR existing_outcome.adjusted_return IS DISTINCT FROM adjusted_return_value
      OR existing_outcome.brier_score IS DISTINCT FROM brier_score_value
      OR existing_outcome.log_loss IS DISTINCT FROM log_loss_value
      OR existing_outcome.source_bar_hash IS DISTINCT FROM p_outcome->>'sourceBarHash'
      OR existing_outcome.correction_of_outcome_id IS NOT NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'resolution identity conflicts with a different immutable payload';
    END IF;
    RETURN QUERY SELECT false, existing_event.id, existing_outcome.id;
    RETURN;
  END IF;

  INSERT INTO forecast_events (id, forecast_id, event_type, reason, payload)
  VALUES (p_event->>'id', p_event->>'forecastId', 'resolved', p_event->>'reason', COALESCE(p_event->'payload', '{}'::jsonb));
  INSERT INTO forecast_outcomes (
    id, forecast_id, realized_label, adjusted_return, brier_score, log_loss, source_bar_hash
  ) VALUES (
    p_outcome->>'id', p_outcome->>'forecastId', p_outcome->>'realizedLabel',
    adjusted_return_value, brier_score_value, log_loss_value, p_outcome->>'sourceBarHash'
  );
  RETURN QUERY SELECT true, p_event->>'id', p_outcome->>'id';
END
$$;

CREATE FUNCTION void_forecast(p_event jsonb)
RETURNS TABLE (created boolean, id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE existing forecast_events%ROWTYPE;
BEGIN
  IF p_event->>'type' IS DISTINCT FROM 'void' OR p_event ? 'referencesEventId'
    OR NULLIF(p_event->>'reason', '') IS NULL
  THEN RAISE EXCEPTION 'void requires a terminal reason and no reference'; END IF;
  PERFORM 1 FROM forecasts WHERE id = p_event->>'forecastId' FOR UPDATE;
  SELECT * INTO existing FROM forecast_events WHERE forecast_events.id = p_event->>'id';
  IF existing.id IS NOT NULL THEN
    IF existing.forecast_id IS DISTINCT FROM p_event->>'forecastId'
      OR existing.event_type IS DISTINCT FROM 'void'
      OR existing.reason IS DISTINCT FROM p_event->>'reason'
      OR existing.payload IS DISTINCT FROM COALESCE(p_event->'payload', '{}'::jsonb)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'void identity conflicts with a different immutable payload';
    END IF;
    RETURN QUERY SELECT false, existing.id;
    RETURN;
  END IF;
  INSERT INTO forecast_events (id, forecast_id, event_type, reason, payload)
  VALUES (p_event->>'id', p_event->>'forecastId', 'void', p_event->>'reason', COALESCE(p_event->'payload', '{}'::jsonb));
  RETURN QUERY SELECT true, p_event->>'id';
END
$$;

CREATE FUNCTION correct_forecast_outcome(p_event jsonb, p_outcome jsonb)
RETURNS TABLE (created boolean, event_id text, outcome_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing_event forecast_events%ROWTYPE;
  existing_outcome forecast_outcomes%ROWTYPE;
  adjusted_return_value numeric;
  brier_score_value numeric;
  log_loss_value numeric;
BEGIN
  IF p_event->>'type' IS DISTINCT FROM 'correction'
    OR NULLIF(p_event->>'referencesEventId', '') IS NULL
    OR NULLIF(p_event->>'reason', '') IS NULL
    OR NULLIF(p_outcome->>'correctionOfOutcomeId', '') IS NULL
    OR NULLIF(p_outcome->>'correctionReason', '') IS NULL
    OR p_event->>'forecastId' IS DISTINCT FROM p_outcome->>'forecastId'
    OR p_event->>'reason' IS DISTINCT FROM p_outcome->>'correctionReason'
  THEN RAISE EXCEPTION 'correction requires matching event and outcome payloads'; END IF;
  adjusted_return_value := assert_json_number(p_outcome, 'adjustedReturn');
  brier_score_value := assert_json_number(p_outcome, 'brierScore', true);
  log_loss_value := assert_json_number(p_outcome, 'logLoss', true);
  PERFORM 1 FROM forecasts WHERE id = p_event->>'forecastId' FOR UPDATE;

  SELECT * INTO existing_event FROM forecast_events WHERE id = p_event->>'id';
  SELECT * INTO existing_outcome FROM forecast_outcomes WHERE id = p_outcome->>'id';
  IF existing_event.id IS NOT NULL OR existing_outcome.id IS NOT NULL THEN
    IF existing_event.id IS NULL OR existing_outcome.id IS NULL
      OR existing_event.forecast_id IS DISTINCT FROM p_event->>'forecastId'
      OR existing_event.event_type IS DISTINCT FROM 'correction'
      OR existing_event.reason IS DISTINCT FROM p_event->>'reason'
      OR existing_event.references_event_id IS DISTINCT FROM p_event->>'referencesEventId'
      OR existing_event.payload IS DISTINCT FROM COALESCE(p_event->'payload', '{}'::jsonb)
      OR existing_outcome.forecast_id IS DISTINCT FROM p_outcome->>'forecastId'
      OR existing_outcome.realized_label IS DISTINCT FROM p_outcome->>'realizedLabel'
      OR existing_outcome.adjusted_return IS DISTINCT FROM adjusted_return_value
      OR existing_outcome.brier_score IS DISTINCT FROM brier_score_value
      OR existing_outcome.log_loss IS DISTINCT FROM log_loss_value
      OR existing_outcome.source_bar_hash IS DISTINCT FROM p_outcome->>'sourceBarHash'
      OR existing_outcome.correction_of_outcome_id IS DISTINCT FROM p_outcome->>'correctionOfOutcomeId'
      OR existing_outcome.correction_reason IS DISTINCT FROM p_outcome->>'correctionReason'
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'correction identity conflicts with a different immutable payload';
    END IF;
    RETURN QUERY SELECT false, existing_event.id, existing_outcome.id;
    RETURN;
  END IF;

  INSERT INTO forecast_events (id, forecast_id, event_type, reason, references_event_id, payload)
  VALUES (p_event->>'id', p_event->>'forecastId', 'correction', p_event->>'reason', p_event->>'referencesEventId', COALESCE(p_event->'payload', '{}'::jsonb));
  INSERT INTO forecast_outcomes (
    id, forecast_id, realized_label, adjusted_return, brier_score, log_loss,
    source_bar_hash, correction_of_outcome_id, correction_reason
  ) VALUES (
    p_outcome->>'id', p_outcome->>'forecastId', p_outcome->>'realizedLabel',
    adjusted_return_value, brier_score_value, log_loss_value,
    p_outcome->>'sourceBarHash', p_outcome->>'correctionOfOutcomeId', p_outcome->>'correctionReason'
  );
  RETURN QUERY SELECT true, p_event->>'id', p_outcome->>'id';
END
$$;

CREATE FUNCTION append_paper_event(p_event jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  cash_value numeric;
  shares_value numeric;
  price_value numeric;
BEGIN
  IF p_event->>'type' = 'correction' OR p_event ? 'correctionOfEventId' THEN
    RAISE EXCEPTION 'worker paper event cannot be a correction';
  END IF;
  cash_value := assert_json_number(p_event, 'cashDelta');
  shares_value := assert_json_number(p_event, 'sharesDelta');
  price_value := assert_json_number(p_event, 'price', true);
  INSERT INTO paper_events (
    id, forecast_id, event_type, symbol, cash_delta, shares_delta, price,
    reason, source_hash
  ) VALUES (
    p_event->>'id', p_event->>'forecastId', p_event->>'type',
    p_event->>'symbol', cash_value, shares_value, price_value,
    p_event->>'reason', p_event->>'sourceHash'
  );
  RETURN p_event->>'id';
END
$$;

CREATE FUNCTION append_paper_correction(p_event jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  cash_value numeric;
  shares_value numeric;
  price_value numeric;
BEGIN
  IF p_event->>'type' IS DISTINCT FROM 'correction'
    OR NULLIF(p_event->>'correctionOfEventId', '') IS NULL
    OR NULLIF(p_event->>'reason', '') IS NULL
  THEN
    RAISE EXCEPTION 'operator paper correction needs a reference and reason';
  END IF;
  cash_value := assert_json_number(p_event, 'cashDelta');
  shares_value := assert_json_number(p_event, 'sharesDelta');
  price_value := assert_json_number(p_event, 'price', true);
  INSERT INTO paper_events (
    id, forecast_id, event_type, symbol, cash_delta, shares_delta, price,
    correction_of_event_id, reason, source_hash
  ) VALUES (
    p_event->>'id', p_event->>'forecastId', 'correction',
    p_event->>'symbol', cash_value, shares_value, price_value,
    p_event->>'correctionOfEventId', p_event->>'reason',
    p_event->>'sourceHash'
  );
  RETURN p_event->>'id';
END
$$;

CREATE FUNCTION append_job_operation(p_operation jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing job_operations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('job-operation:' || COALESCE(p_operation->>'operationKey', ''), 0)
  );
  SELECT * INTO existing FROM job_operations
  WHERE id = p_operation->>'id'
    OR operation_key = p_operation->>'operationKey'
  ORDER BY CASE WHEN id = p_operation->>'id' THEN 0 ELSE 1 END
  LIMIT 1;
  IF existing.id IS NOT NULL THEN
    IF existing.id IS DISTINCT FROM p_operation->>'id'
      OR existing.operation_key IS DISTINCT FROM p_operation->>'operationKey'
      OR existing.operation_type IS DISTINCT FROM p_operation->>'operationType'
      OR existing.replay_of_operation_id IS DISTINCT FROM NULLIF(p_operation->>'replayOfOperationId', '')
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'job operation key or ID conflicts with a different immutable payload';
    END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO job_operations (
    id, operation_key, operation_type, replay_of_operation_id
  ) VALUES (
    p_operation->>'id', p_operation->>'operationKey',
    p_operation->>'operationType', p_operation->>'replayOfOperationId'
  );
  RETURN p_operation->>'id';
END
$$;

CREATE FUNCTION append_job_attempt(p_attempt jsonb, p_scheduled_event_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing job_attempts%ROWTYPE;
  scheduled job_attempt_events%ROWTYPE;
  attempt_number_value integer;
BEGIN
  IF jsonb_typeof(p_attempt->'attemptNumber') <> 'number'
    OR (p_attempt->>'attemptNumber') !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION 'attemptNumber must be a positive JSON integer';
  END IF;
  attempt_number_value := (p_attempt->>'attemptNumber')::integer;
  PERFORM 1 FROM job_operations WHERE id = p_attempt->>'operationId' FOR UPDATE;
  SELECT * INTO existing FROM job_attempts
  WHERE id = p_attempt->>'id'
    OR (operation_id = p_attempt->>'operationId' AND attempt_number = attempt_number_value)
  ORDER BY CASE WHEN id = p_attempt->>'id' THEN 0 ELSE 1 END
  LIMIT 1;
  IF existing.id IS NOT NULL THEN
    SELECT * INTO scheduled FROM job_attempt_events
    WHERE attempt_id = existing.id AND status = 'scheduled';
    IF existing.id IS DISTINCT FROM p_attempt->>'id'
      OR existing.operation_id IS DISTINCT FROM p_attempt->>'operationId'
      OR existing.attempt_number IS DISTINCT FROM attempt_number_value
      OR scheduled.id IS DISTINCT FROM p_scheduled_event_id
      OR scheduled.details IS DISTINCT FROM COALESCE(p_attempt->'details', '{}'::jsonb)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'job attempt key or ID conflicts with a different immutable payload';
    END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO job_attempts (id, operation_id, attempt_number)
  VALUES (
    p_attempt->>'id', p_attempt->>'operationId',
    attempt_number_value
  );
  INSERT INTO job_attempt_events (id, attempt_id, status, details)
  VALUES (
    p_scheduled_event_id, p_attempt->>'id', 'scheduled',
    COALESCE(p_attempt->'details', '{}'::jsonb)
  );
  RETURN p_attempt->>'id';
END
$$;

CREATE FUNCTION append_job_attempt_event(p_event jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing job_attempt_events%ROWTYPE;
BEGIN
  IF p_event->>'status' NOT IN ('evaluating', 'succeeded', 'failed') THEN
    RAISE EXCEPTION 'scheduled status is created with the job attempt';
  END IF;
  PERFORM 1 FROM job_attempts WHERE id = p_event->>'attemptId' FOR UPDATE;
  SELECT * INTO existing FROM job_attempt_events WHERE id = p_event->>'id';
  IF existing.id IS NOT NULL THEN
    IF existing.attempt_id IS DISTINCT FROM p_event->>'attemptId'
      OR existing.status IS DISTINCT FROM p_event->>'status'
      OR existing.error_code IS DISTINCT FROM NULLIF(p_event->>'errorCode', '')
      OR existing.details IS DISTINCT FROM COALESCE(p_event->'details', '{}'::jsonb)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'job attempt event ID conflicts with a different immutable payload';
    END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO job_attempt_events (
    id, attempt_id, status, error_code, details
  ) VALUES (
    p_event->>'id', p_event->>'attemptId', p_event->>'status',
    p_event->>'errorCode', COALESCE(p_event->'details', '{}'::jsonb)
  );
  RETURN p_event->>'id';
END
$$;

CREATE FUNCTION append_ledger_root(p_root jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO ledger_roots (
    id, batch_key, root_hash, previous_root_hash, attestation_deadline,
    artifact_url, attestation_url, attested_at
  ) VALUES (
    p_root->>'id', p_root->>'batchKey', p_root->>'rootHash',
    p_root->>'previousRootHash',
    (p_root->>'attestationDeadline')::timestamptz,
    p_root->>'artifactUrl', p_root->>'attestationUrl',
    (p_root->>'attestedAt')::timestamptz
  );
  RETURN p_root->>'id';
END
$$;

CREATE FUNCTION append_visitor_pick_result(p_result jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing visitor_pick_results%ROWTYPE;
BEGIN
  PERFORM 1 FROM visitor_picks WHERE id = p_result->>'visitorPickId' FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1
    FROM visitor_picks pick
    JOIN active_forecast_outcomes outcome
      ON outcome.forecast_id = pick.forecast_id
    WHERE pick.id = p_result->>'visitorPickId'
      AND outcome.id = p_result->>'outcomeId'
  ) THEN
    RAISE EXCEPTION 'visitor pick result must reference the active outcome for the same forecast';
  END IF;
  SELECT * INTO existing FROM visitor_pick_results
  WHERE id = p_result->>'id' OR visitor_pick_id = p_result->>'visitorPickId'
  LIMIT 1;
  IF existing.id IS NOT NULL THEN
    IF existing.id IS DISTINCT FROM p_result->>'id'
      OR existing.visitor_pick_id IS DISTINCT FROM p_result->>'visitorPickId'
      OR existing.outcome_id IS DISTINCT FROM p_result->>'outcomeId'
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'visitor pick result conflicts with a different immutable payload';
    END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO visitor_pick_results (
    id, visitor_pick_id, outcome_id
  ) VALUES (
    p_result->>'id', p_result->>'visitorPickId', p_result->>'outcomeId'
  );
  RETURN p_result->>'id';
END
$$;

CREATE FUNCTION record_visitor_pick(
  p_pick_id text,
  p_identifier_id text,
  p_identifier_digest char(64),
  p_expires_at timestamptz,
  p_forecast_id text,
  p_choice text
)
RETURNS TABLE (
  created boolean,
  id text,
  forecast_id text,
  choice text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  stable_pick_id text;
  inserted_id text;
BEGIN
  IF p_choice NOT IN ('up', 'flat', 'down') THEN
    RAISE EXCEPTION 'invalid blind-pick choice';
  END IF;
  INSERT INTO private_identifiers (
    id, identifier_kind, token_digest, scope_key, record_id, expires_at
  ) VALUES (
    p_identifier_id, 'visitor_pick', p_identifier_digest, p_forecast_id, p_pick_id,
    LEAST(p_expires_at, clock_timestamp() + interval '30 days')
  )
  ON CONFLICT (identifier_kind, token_digest, scope_key) DO NOTHING;

  SELECT private_identifiers.record_id INTO stable_pick_id
  FROM private_identifiers
  WHERE identifier_kind = 'visitor_pick'
    AND token_digest = p_identifier_digest
    AND scope_key = p_forecast_id;

  INSERT INTO visitor_picks (id, forecast_id, choice)
  VALUES (stable_pick_id, p_forecast_id, p_choice)
  ON CONFLICT ON CONSTRAINT visitor_picks_pkey DO NOTHING
  RETURNING visitor_picks.id INTO inserted_id;

  RETURN QUERY
    SELECT inserted_id IS NOT NULL, pick.id, pick.forecast_id,
           pick.choice, pick.created_at
    FROM visitor_picks pick
    WHERE pick.id = stable_pick_id;
END
$$;

CREATE FUNCTION record_analytics_event(
  p_event_id text,
  p_consent boolean,
  p_identifier_id text,
  p_identifier_digest char(64),
  p_expires_at timestamptz,
  p_event_name text,
  p_symbol text,
  p_forecast_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE(p_consent, false) THEN
    RETURN NULL;
  END IF;
  IF p_event_name NOT IN ('stock_view', 'pick', 'reveal', 'return', 'share') THEN
    RAISE EXCEPTION 'invalid analytics event';
  END IF;
  INSERT INTO private_identifiers (
    id, identifier_kind, token_digest, scope_key, record_id, expires_at
  ) VALUES (
    p_identifier_id, 'analytics', p_identifier_digest, p_event_id, p_event_id,
    LEAST(p_expires_at, clock_timestamp() + interval '30 days')
  )
  ON CONFLICT (identifier_kind, token_digest, scope_key) DO NOTHING;

  INSERT INTO analytics_events (
    id, event_name, symbol, forecast_id
  ) VALUES (
    p_event_id, p_event_name, p_symbol, p_forecast_id
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN p_event_id;
END
$$;

CREATE FUNCTION purge_expired_identifiers(p_run_id text, p_cutoff_at timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM private_identifiers WHERE expires_at <= p_cutoff_at;
  GET DIAGNOSTICS removed = ROW_COUNT;
  INSERT INTO identifier_expiry_runs (id, cutoff_at, purged_count)
  VALUES (p_run_id, p_cutoff_at, removed);
  RETURN removed;
END
$$;

REVOKE ALL ON TABLE
  symbols, provider_rights, processor_terms, market_bars, market_snapshots,
  snapshot_bar_refs, evidence_descriptors, judgment_runs, judgment_answers,
  policy_decisions, forecasts, forecast_events, forecast_outcomes,
  paper_events, job_operations, job_attempts, job_attempt_events, ledger_roots,
  private_identifiers, visitor_picks, visitor_pick_results, analytics_events,
  identifier_expiry_runs, forecast_current_states, active_forecast_outcomes,
  visitor_pick_current_results, paper_position_projection, analytics_aggregate
FROM PUBLIC, jev_public_reader, jev_public_ingest, jev_worker, jev_operator;

REVOKE ALL ON FUNCTION reject_immutable_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_forecast_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_forecast_dependencies() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_market_snapshot_sources() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_snapshot_bar_reference() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_forecast_outcome() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_job_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_job_attempt_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION assert_json_number(jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_ledger_content_hash(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_snapshot_history(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_mode_gate(timestamptz, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_public_forecasts() FROM PUBLIC;
REVOKE ALL ON FUNCTION publish_forecast(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION upsert_symbol(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_provider_rights(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_processor_terms(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_market_bar(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_market_snapshot(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_judgment_run(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_policy_decision(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_forecast(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION void_forecast(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION correct_forecast_outcome(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_paper_event(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_paper_correction(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_job_operation(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_job_attempt(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_job_attempt_event(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_ledger_root(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_visitor_pick_result(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_visitor_pick(text, text, char(64), timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_analytics_event(text, boolean, text, char(64), timestamptz, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_identifiers(text, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public_mode_gate(timestamptz, text, text, text[])
  TO jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION read_public_forecasts()
  TO jev_public_reader;
GRANT EXECUTE ON FUNCTION record_visitor_pick(text, text, char(64), timestamptz, text, text)
  TO jev_public_ingest;
GRANT EXECUTE ON FUNCTION record_analytics_event(text, boolean, text, char(64), timestamptz, text, text, text)
  TO jev_public_ingest;
GRANT EXECUTE ON FUNCTION publish_forecast(jsonb, text) TO jev_worker;
GRANT EXECUTE ON FUNCTION append_market_bar(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION append_market_snapshot(jsonb, jsonb, jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION append_judgment_run(jsonb, jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION append_policy_decision(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION resolve_forecast(jsonb, jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION void_forecast(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION append_paper_event(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION append_job_operation(jsonb)
  TO jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION append_job_attempt(jsonb, text)
  TO jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION append_job_attempt_event(jsonb)
  TO jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION append_ledger_root(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION append_visitor_pick_result(jsonb) TO jev_worker;
GRANT EXECUTE ON FUNCTION upsert_symbol(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION append_provider_rights(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION append_processor_terms(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION correct_forecast_outcome(jsonb, jsonb)
  TO jev_operator;
GRANT EXECUTE ON FUNCTION append_paper_correction(jsonb) TO jev_operator;
GRANT EXECUTE ON FUNCTION purge_expired_identifiers(text, timestamptz)
  TO jev_worker, jev_operator;

COMMIT;
