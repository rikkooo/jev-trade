\set ON_ERROR_STOP on
-- One line that changes if any v0.1 ledger row or the public projection
-- changes. Used to prove the Phase Two migration leaves v0.1 untouched.
CREATE FUNCTION pg_temp.v01_digest()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  table_name text;
  digest text;
  parts text[] := ARRAY[]::text[];
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'symbols', 'provider_rights', 'processor_terms', 'market_bars',
    'market_snapshots', 'snapshot_bar_refs', 'evidence_descriptors',
    'judgment_runs', 'judgment_answers', 'policy_decisions', 'forecasts',
    'forecast_events', 'forecast_outcomes', 'paper_events', 'job_operations',
    'job_attempts', 'job_attempt_events', 'ledger_roots', 'private_identifiers',
    'visitor_picks', 'visitor_pick_results', 'analytics_events',
    'identifier_expiry_runs'
  ] LOOP
    EXECUTE format(
      'SELECT count(*) || '':'' || md5(COALESCE(string_agg(to_jsonb(t)::text, ''|'' ORDER BY to_jsonb(t)::text), '''')) FROM %I t',
      table_name
    ) INTO digest;
    parts := parts || (table_name || '=' || digest);
  END LOOP;
  SELECT md5(COALESCE(string_agg(to_jsonb(p)::text, '|' ORDER BY to_jsonb(p)::text), ''))
  INTO digest FROM read_public_forecasts() p;
  parts := parts || ('read_public_forecasts=' || digest);
  RETURN array_to_string(parts, ' ');
END
$$;
SELECT pg_temp.v01_digest();
