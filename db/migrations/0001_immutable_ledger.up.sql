BEGIN;

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
  revision integer NOT NULL CHECK (revision >= 1),
  unadjusted_open numeric NOT NULL CHECK (unadjusted_open > 0),
  unadjusted_high numeric NOT NULL CHECK (unadjusted_high > 0),
  unadjusted_low numeric NOT NULL CHECK (unadjusted_low > 0),
  unadjusted_close numeric NOT NULL CHECK (unadjusted_close > 0),
  adjusted_open numeric NOT NULL CHECK (adjusted_open > 0),
  adjusted_high numeric NOT NULL CHECK (adjusted_high > 0),
  adjusted_low numeric NOT NULL CHECK (adjusted_low > 0),
  adjusted_close numeric NOT NULL CHECK (adjusted_close > 0),
  volume numeric NOT NULL CHECK (volume >= 0),
  corporate_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (provider, symbol, session_date, revision),
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
  latest_market_session date NOT NULL,
  canonical_state jsonb NOT NULL,
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
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
  descriptor jsonb NOT NULL,
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (snapshot_id, source_id, content_hash)
);

CREATE TABLE judgment_runs (
  id text PRIMARY KEY CHECK (id <> ''),
  snapshot_id text NOT NULL REFERENCES market_snapshots(id),
  provider text NOT NULL CHECK (provider <> ''),
  model_version text NOT NULL CHECK (model_version <> ''),
  question_version text NOT NULL CHECK (question_version <> ''),
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  typed_response jsonb,
  content_hash char(64) CHECK (content_hash ~ '^[a-f0-9]{64}$'),
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
  adjusted_return numeric NOT NULL,
  brier_score numeric CHECK (brier_score >= 0),
  log_loss numeric CHECK (log_loss >= 0),
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
  cash_delta numeric NOT NULL,
  shares_delta numeric NOT NULL,
  price numeric CHECK (price > 0),
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
  CHECK (expires_at <= created_at + interval '30 days')
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
  correct boolean NOT NULL,
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

CREATE FUNCTION validate_forecast_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  corrected_forecast text;
  already_corrected boolean;
BEGIN
  IF NEW.correction_of_outcome_id IS NULL THEN
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

CREATE FUNCTION validate_job_attempt_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status text;
BEGIN
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

CREATE FUNCTION public_mode_gate(p_at timestamptz)
RETURNS TABLE (allowed boolean, blockers text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH gates AS (
  SELECT
    EXISTS (
      SELECT 1 FROM provider_rights
      WHERE audience = 'public'
        AND effective_from <= p_at
        AND (effective_to IS NULL OR p_at < effective_to)
        AND derived_outputs
        AND screenshots_and_video
        AND onward_ai_processing
    ) AS has_rights,
    EXISTS (
      SELECT 1 FROM processor_terms
      WHERE effective_from <= p_at
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
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_id text;
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
    SELECT id INTO inserted_id FROM forecasts
    WHERE publication_key = p_forecast->>'publicationKey';
    RETURN QUERY SELECT false, inserted_id;
    RETURN;
  END IF;

  INSERT INTO forecast_events (id, forecast_id, event_type)
  VALUES (p_publication_event_id, inserted_id, 'published');
  RETURN QUERY SELECT true, inserted_id;
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
SET search_path = public, pg_temp
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
  ON CONFLICT (id) DO NOTHING
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT SELECT ON forecast_current_states, active_forecast_outcomes,
  paper_position_projection, analytics_aggregate TO jev_public_reader;
GRANT EXECUTE ON FUNCTION public_mode_gate(timestamptz) TO jev_public_reader, jev_worker, jev_operator;
GRANT EXECUTE ON FUNCTION record_visitor_pick(text, text, char(64), timestamptz, text, text)
  TO jev_public_ingest;
GRANT EXECUTE ON FUNCTION record_analytics_event(text, boolean, text, char(64), timestamptz, text, text, text)
  TO jev_public_ingest;
GRANT EXECUTE ON FUNCTION publish_forecast(jsonb, text) TO jev_worker;
GRANT EXECUTE ON FUNCTION purge_expired_identifiers(text, timestamptz)
  TO jev_worker, jev_operator;

COMMIT;
