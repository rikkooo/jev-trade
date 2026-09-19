\set ON_ERROR_STOP on

DO $$
BEGIN
  IF has_table_privilege('jev_public_reader', 'forecast_current_states', 'SELECT')
    OR has_table_privilege('jev_public_reader', 'active_forecast_outcomes', 'SELECT')
    OR has_table_privilege('jev_worker', 'forecasts', 'INSERT')
    OR has_table_privilege('jev_public_ingest', 'analytics_events', 'INSERT')
  THEN
    RAISE EXCEPTION 'application roles must not bypass gated functions';
  END IF;
  IF NOT has_function_privilege('jev_public_reader', 'read_public_forecasts()', 'EXECUTE')
    OR NOT has_function_privilege('jev_worker', 'resolve_forecast(jsonb,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('jev_operator', 'correct_forecast_outcome(jsonb,jsonb)', 'EXECUTE')
    OR has_function_privilege('jev_public_reader', 'public_mode_gate(timestamptz,text,text,text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'ledger procedure role matrix is incorrect';
  END IF;
END
$$;

SELECT verify_ledger_content_hash(
  'policy_decision',
  '{"kind":"policy_decision","payload":{"action":"enter","gateTrace":{"eligible":true},"judgmentId":"judgment_1","policyVersion":"policy-v1","sizing":{"shares":10}},"recipe":"jev-ledger-canonical-json/v1"}',
  '868f3f955d7664b6141c374b04b57e836052f2090449fbda5e21f85b25526fe6',
  '{"action":"enter","gateTrace":{"eligible":true},"judgmentId":"judgment_1","policyVersion":"policy-v1","sizing":{"shares":10}}'::jsonb
);

SET ROLE jev_operator;
SELECT upsert_symbol('{"symbol":"AAPL","exchange":"XNAS","currency":"USD","benchmarkSymbol":"SPY","enabled":true}'::jsonb);
SELECT upsert_symbol('{"symbol":"SPY","exchange":"ARCX","currency":"USD","benchmarkSymbol":"SPY","enabled":true}'::jsonb);
SELECT append_provider_rights(jsonb_build_object(
  'id', 'rights_1', 'provider', 'licensed-provider', 'planOrContract', 'contract-v1',
  'permittedFields', jsonb_build_array('daily_ohlcv', 'corporate_actions', 'exchange_calendar', 'structured_events'),
  'audience', 'public', 'retention', 'contract-defined', 'attribution', 'Licensed Provider',
  'derivedOutputs', true, 'screenshotsAndVideo', true, 'onwardAiProcessing', true,
  'effectiveFrom', clock_timestamp() - interval '1 day', 'reviewedBy', 'operator',
  'evidenceHash', repeat('a', 64)
));
SELECT append_processor_terms(jsonb_build_object(
  'id', 'terms_1', 'processor', 'openrouter-jev', 'retention', 'none',
  'training', 'disabled', 'residency', 'us', 'deletion', 'supported',
  'effectiveFrom', clock_timestamp() - interval '1 day', 'reviewedBy', 'operator',
  'evidenceHash', repeat('b', 64)
));
SELECT append_provider_rights(jsonb_build_object(
  'id', 'rights_b_expired', 'provider', 'unlicensed-provider', 'planOrContract', 'expired-contract',
  'permittedFields', jsonb_build_array('daily_ohlcv', 'corporate_actions', 'exchange_calendar', 'structured_events'),
  'audience', 'public', 'retention', 'contract-defined', 'attribution', 'Expired Provider',
  'derivedOutputs', true, 'screenshotsAndVideo', true, 'onwardAiProcessing', true,
  'effectiveFrom', clock_timestamp() - interval '2 days',
  'effectiveTo', clock_timestamp() - interval '1 day', 'reviewedBy', 'operator',
  'evidenceHash', repeat('e', 64)
));
RESET ROLE;

DO $$
DECLARE
  provider_value text;
  symbol_value text;
  session_value date;
  ordinal_value integer;
BEGIN
  SET LOCAL ROLE jev_worker;
  FOREACH provider_value IN ARRAY ARRAY['licensed-provider', 'unlicensed-provider'] LOOP
    FOREACH symbol_value IN ARRAY ARRAY['AAPL', 'SPY'] LOOP
      FOR ordinal_value IN 0..271 LOOP
        session_value := date '2025-12-21' + ordinal_value;
        PERFORM append_market_bar(jsonb_build_object(
          'id', provider_value || ':' || symbol_value || ':' || session_value,
          'symbol', symbol_value, 'provider', provider_value,
          'sessionDate', session_value, 'sourceId', 'eod:' || provider_value || ':' || symbol_value || ':' || session_value,
          'sourceRevision', 'v1', 'sourceAvailableAt', (session_value::text || 'T21:30:00.000Z'),
          'unadjustedOpen', 100 + ordinal_value, 'unadjustedHigh', 102 + ordinal_value,
          'unadjustedLow', 99 + ordinal_value, 'unadjustedClose', 101 + ordinal_value,
          'adjustedOpen', 100 + ordinal_value, 'adjustedHigh', 102 + ordinal_value,
          'adjustedLow', 99 + ordinal_value, 'adjustedClose', 101 + ordinal_value,
          'volume', 1000000 + ordinal_value, 'sourceHash', repeat(CASE WHEN symbol_value = 'AAPL' THEN 'c' ELSE 'd' END, 64)
        ));
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;

DO $$
DECLARE
  provider_value text;
  snapshot_id_value text;
  manifest jsonb;
  refs jsonb;
  bad_refs jsonb;
  payload jsonb;
  snapshot jsonb;
  canonical text;
  evidence jsonb;
BEGIN
  SET LOCAL ROLE jev_worker;
  FOREACH provider_value IN ARRAY ARRAY['licensed-provider', 'unlicensed-provider'] LOOP
    snapshot_id_value := CASE WHEN provider_value = 'licensed-provider' THEN 'snapshot_a' ELSE 'snapshot_b' END;
    SELECT jsonb_agg(jsonb_build_object(
      'sourceId', 'eod:' || provider_value || ':' || symbol_value || ':' || session_value::date,
      'sourceRevision', 'v1',
      'sourceHash', repeat(CASE WHEN symbol_value = 'AAPL' THEN 'c' ELSE 'd' END, 64),
      'availableAt', session_value::date::text || 'T21:30:00.000Z'
    ) ORDER BY symbol_value, session_value)
    INTO manifest
    FROM (SELECT symbol_value, session_value
          FROM unnest(ARRAY['AAPL','SPY']) AS symbols(symbol_value)
          CROSS JOIN generate_series(date '2025-12-21', date '2026-09-18', interval '1 day') AS sessions(session_value)) sources;

    SELECT jsonb_agg(jsonb_build_object(
      'barId', provider_value || ':' || symbol_value || ':' || session_value::date,
      'role', CASE WHEN symbol_value = 'AAPL' THEN 'symbol' ELSE 'benchmark' END,
      'ordinal', ordinal_value, 'symbol', symbol_value, 'sessionDate', session_value::date
    ) ORDER BY symbol_value DESC, ordinal_value)
    INTO refs
    FROM (SELECT symbol_value, session_value,
                 row_number() OVER (PARTITION BY symbol_value ORDER BY session_value) - 1 AS ordinal_value
          FROM unnest(ARRAY['AAPL','SPY']) AS symbols(symbol_value)
          CROSS JOIN generate_series(date '2025-12-21', date '2026-09-18', interval '1 day') AS sessions(session_value)) series;

    payload := jsonb_build_object(
      'symbol', 'AAPL', 'provider', provider_value,
      'cutoffAt', '2026-09-18T21:00:00.000Z', 'knowledgeCutoffAt', '2026-09-18T23:00:00.000Z',
      'providerFetchedAt', '2026-09-18T22:00:00.000Z', 'sourceUpdatedAt', '2026-09-18T21:30:00.000Z',
      'latestMarketSession', '2026-09-18', 'sourceManifest', manifest, 'state', jsonb_build_object('risk', 41)
    );
    canonical := jsonb_build_object('recipe', 'jev-ledger-canonical-json/v1', 'kind', 'market_snapshot', 'payload', payload)::text;
    snapshot := jsonb_build_object(
      'id', snapshot_id_value, 'symbol', 'AAPL', 'provider', provider_value,
      'cutoffAt', '2026-09-18T21:00:00.000Z', 'knowledgeCutoffAt', '2026-09-18T23:00:00.000Z',
      'providerFetchedAt', '2026-09-18T22:00:00.000Z', 'sourceUpdatedAt', '2026-09-18T21:30:00.000Z',
      'latestMarketSession', '2026-09-18', 'sourceManifest', manifest, 'state', jsonb_build_object('risk', 41),
      'canonicalPayload', canonical, 'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
    );
    evidence := jsonb_build_array(jsonb_build_object(
      'id', 'evidence_' || snapshot_id_value,
      'sourceId', 'eod:' || provider_value || ':AAPL:2026-09-18', 'sourceRevision', 'v1',
      'sourceHash', repeat('c', 64), 'availableAt', '2026-09-18T21:30:00.000Z',
      'descriptor', jsonb_build_object('trend', 'up'), 'contentHash', repeat('4', 64)
    ));
    PERFORM append_market_snapshot(snapshot, refs, evidence);

    IF provider_value = 'licensed-provider' THEN
      BEGIN
        PERFORM append_market_snapshot(
          snapshot || jsonb_build_object('id', 'snapshot_bad_hash', 'contentHash', repeat('0', 64)), refs, evidence
        );
        RAISE EXCEPTION 'mismatched snapshot hash must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'mismatched snapshot hash must fail' THEN RAISE; END IF;
      END;
      SELECT jsonb_agg(
        CASE WHEN value->>'role' = 'symbol' AND (value->>'ordinal')::integer = 0
          THEN jsonb_set(value, '{barId}', to_jsonb(provider_value || ':SPY:2025-12-21'))
          ELSE value END
      ) INTO bad_refs FROM jsonb_array_elements(refs) value;
      BEGIN
        PERFORM append_market_snapshot(snapshot || jsonb_build_object('id', 'snapshot_wrong_symbol'), bad_refs, evidence);
        RAISE EXCEPTION 'wrong-symbol snapshot reference must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'wrong-symbol snapshot reference must fail' THEN RAISE; END IF;
      END;
      SELECT jsonb_agg(
        CASE WHEN value->>'role' = 'benchmark' AND (value->>'ordinal')::integer = 100
          THEN jsonb_set(value, '{barId}', to_jsonb(provider_value || ':SPY:2026-04-01'))
          ELSE value END
      ) INTO bad_refs FROM jsonb_array_elements(refs) value;
      BEGIN
        PERFORM append_market_snapshot(snapshot || jsonb_build_object('id', 'snapshot_misaligned'), bad_refs, evidence);
        RAISE EXCEPTION 'misaligned snapshot sessions must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'misaligned snapshot sessions must fail' THEN RAISE; END IF;
      END;
      BEGIN
        PERFORM append_market_snapshot(
          snapshot || jsonb_build_object('id', 'snapshot_short'), refs - (jsonb_array_length(refs) - 1), evidence
        );
        RAISE EXCEPTION 'short snapshot history must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'short snapshot history must fail' THEN RAISE; END IF;
      END;
      BEGIN
        PERFORM append_market_snapshot(
          snapshot || jsonb_build_object('id', 'snapshot_bad_ordinal'),
          jsonb_set(refs, '{0,ordinal}', '1'::jsonb), evidence
        );
        RAISE EXCEPTION 'non-contiguous snapshot history must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'non-contiguous snapshot history must fail' THEN RAISE; END IF;
      END;
      BEGIN
        PERFORM append_market_snapshot(
          snapshot || jsonb_build_object('id', 'snapshot_bad_evidence'), refs,
          jsonb_build_array(jsonb_build_object(
            'id', 'bad_evidence', 'sourceId', 'eod:' || provider_value || ':AAPL:2026-09-18',
            'sourceRevision', 'wrong', 'sourceHash', repeat('c', 64),
            'availableAt', '2026-09-18T21:30:00.000Z', 'descriptor', '{}'::jsonb,
            'contentHash', repeat('4', 64)
          ))
        );
        RAISE EXCEPTION 'evidence provenance mismatch must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'evidence provenance mismatch must fail' THEN RAISE; END IF;
      END;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  suffix text;
  snapshot_id_value text;
  provider_value text;
  answers jsonb;
  run_payload jsonb;
  run_value jsonb;
  policy_payload jsonb;
  policy_value jsonb;
  canonical text;
BEGIN
  SET LOCAL ROLE jev_worker;
  FOREACH suffix IN ARRAY ARRAY['a', 'b'] LOOP
    snapshot_id_value := 'snapshot_' || suffix;
    provider_value := CASE WHEN suffix = 'a' THEN 'licensed-provider' ELSE 'unlicensed-provider' END;
    answers := jsonb_build_array(jsonb_build_object(
      'id', 'answer_' || suffix, 'answerId', 'direction', 'primitive', 'choice',
      'selectedOption', 'up', 'distribution', jsonb_build_object('up', 0.7, 'flat', 0.2, 'down', 0.1),
      'confidence', 0.7
    ));
    run_payload := jsonb_build_object(
      'snapshotId', snapshot_id_value, 'provider', 'openrouter', 'modelVersion', 'jev-v1',
      'questionVersion', 'questions-v1', 'status', 'succeeded',
      'typedResponse', jsonb_build_object('direction', 'up'), 'errorCode', null,
      'startedAt', '2026-09-18T22:05:00.000Z', 'completedAt', '2026-09-18T22:05:01.000Z',
      'answers', answers
    );
    canonical := jsonb_build_object('recipe', 'jev-ledger-canonical-json/v1', 'kind', 'judgment_run', 'payload', run_payload)::text;
    run_value := jsonb_build_object(
      'id', 'judgment_' || suffix, 'snapshotId', snapshot_id_value, 'provider', 'openrouter',
      'modelVersion', 'jev-v1', 'questionVersion', 'questions-v1', 'status', 'succeeded',
      'typedResponse', jsonb_build_object('direction', 'up'),
      'startedAt', '2026-09-18T22:05:00.000Z', 'completedAt', '2026-09-18T22:05:01.000Z',
      'canonicalPayload', canonical, 'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
    );
    PERFORM append_judgment_run(run_value, answers);
    IF suffix = 'a' THEN
      BEGIN
        PERFORM append_judgment_run(
          run_value || jsonb_build_object('id', 'judgment_bad_hash', 'contentHash', repeat('0', 64)),
          answers
        );
        RAISE EXCEPTION 'mismatched judgment hash must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'mismatched judgment hash must fail' THEN RAISE; END IF;
      END;
    END IF;

    policy_payload := jsonb_build_object(
      'judgmentId', 'judgment_' || suffix, 'policyVersion', 'policy-v1', 'action', 'enter',
      'gateTrace', jsonb_build_object('eligible', true), 'sizing', jsonb_build_object('shares', 10)
    );
    canonical := jsonb_build_object('recipe', 'jev-ledger-canonical-json/v1', 'kind', 'policy_decision', 'payload', policy_payload)::text;
    policy_value := jsonb_build_object(
      'id', 'policy_' || suffix, 'judgmentId', 'judgment_' || suffix,
      'policyVersion', 'policy-v1', 'action', 'enter', 'gateTrace', jsonb_build_object('eligible', true),
      'sizing', jsonb_build_object('shares', 10), 'canonicalPayload', canonical,
      'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
    );
    PERFORM append_policy_decision(policy_value);
    IF suffix = 'a' THEN
      BEGIN
        PERFORM append_policy_decision(
          policy_value || jsonb_build_object('id', 'policy_bad_hash', 'contentHash', repeat('0', 64))
        );
        RAISE EXCEPTION 'mismatched policy hash must fail';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'mismatched policy hash must fail' THEN RAISE; END IF;
      END;
    END IF;

    PERFORM * FROM publish_forecast(jsonb_build_object(
      'id', 'forecast_' || suffix, 'publicationKey', 'AAPL:2026-09-18:position:' || suffix,
      'snapshotId', snapshot_id_value, 'judgmentId', 'judgment_' || suffix,
      'policyDecisionId', 'policy_' || suffix, 'symbol', 'AAPL', 'mode', 'position',
      'horizonSessions', 20, 'cutoffAt', '2026-09-18T21:00:00.000Z',
      'latestMarketSession', '2026-09-18', 'modelVersion', 'jev-v1',
      'questionVersion', 'questions-v1', 'policyVersion', 'policy-v1', 'deploymentSha', 'deadbeef'
    ), 'published_' || suffix);
  END LOOP;
END
$$;

DO $$
DECLARE visible_ids text[];
BEGIN
  SET LOCAL ROLE jev_public_reader;
  SELECT array_agg(forecast_id ORDER BY forecast_id) INTO visible_ids
  FROM read_public_forecasts();
  IF visible_ids IS DISTINCT FROM ARRAY['forecast_a']::text[] THEN
    RAISE EXCEPTION 'gated public read leaked an unlicensed snapshot provider: %', visible_ids;
  END IF;
END
$$;

SET ROLE jev_operator;
SELECT append_provider_rights(jsonb_build_object(
  'id', 'rights_b_active', 'provider', 'unlicensed-provider', 'planOrContract', 'contract-v1',
  'permittedFields', jsonb_build_array('daily_ohlcv', 'corporate_actions', 'exchange_calendar', 'structured_events'),
  'audience', 'public', 'retention', 'contract-defined', 'attribution', 'Provider B',
  'derivedOutputs', true, 'screenshotsAndVideo', true, 'onwardAiProcessing', true,
  'effectiveFrom', clock_timestamp() - interval '1 day', 'reviewedBy', 'operator',
  'evidenceHash', repeat('f', 64)
));
RESET ROLE;

DO $$
DECLARE
  answers jsonb;
  run_payload jsonb;
  policy_payload jsonb;
  canonical text;
BEGIN
  SET LOCAL ROLE jev_worker;
  answers := jsonb_build_array(jsonb_build_object(
    'id', 'answer_c', 'answerId', 'direction', 'primitive', 'choice',
    'selectedOption', 'up', 'distribution', jsonb_build_object('up', 0.7, 'flat', 0.2, 'down', 0.1),
    'confidence', 0.7
  ));
  run_payload := jsonb_build_object(
    'snapshotId', 'snapshot_b', 'provider', 'other-router', 'modelVersion', 'jev-v1',
    'questionVersion', 'questions-v1', 'status', 'succeeded',
    'typedResponse', jsonb_build_object('direction', 'up'), 'errorCode', null,
    'startedAt', '2026-09-18T22:05:00.000Z', 'completedAt', '2026-09-18T22:05:01.000Z',
    'answers', answers
  );
  canonical := jsonb_build_object('recipe', 'jev-ledger-canonical-json/v1', 'kind', 'judgment_run', 'payload', run_payload)::text;
  PERFORM append_judgment_run(jsonb_build_object(
    'id', 'judgment_c', 'snapshotId', 'snapshot_b', 'provider', 'other-router',
    'modelVersion', 'jev-v1', 'questionVersion', 'questions-v1', 'status', 'succeeded',
    'typedResponse', jsonb_build_object('direction', 'up'),
    'startedAt', '2026-09-18T22:05:00.000Z', 'completedAt', '2026-09-18T22:05:01.000Z',
    'canonicalPayload', canonical, 'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  ), answers);
  policy_payload := jsonb_build_object(
    'judgmentId', 'judgment_c', 'policyVersion', 'policy-v1', 'action', 'enter',
    'gateTrace', jsonb_build_object('eligible', true), 'sizing', jsonb_build_object('shares', 10)
  );
  canonical := jsonb_build_object('recipe', 'jev-ledger-canonical-json/v1', 'kind', 'policy_decision', 'payload', policy_payload)::text;
  PERFORM append_policy_decision(jsonb_build_object(
    'id', 'policy_c', 'judgmentId', 'judgment_c', 'policyVersion', 'policy-v1',
    'action', 'enter', 'gateTrace', jsonb_build_object('eligible', true),
    'sizing', jsonb_build_object('shares', 10), 'canonicalPayload', canonical,
    'contentHash', encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  ));
  PERFORM * FROM publish_forecast(jsonb_build_object(
    'id', 'forecast_c', 'publicationKey', 'AAPL:2026-09-18:position:c',
    'snapshotId', 'snapshot_b', 'judgmentId', 'judgment_c', 'policyDecisionId', 'policy_c',
    'symbol', 'AAPL', 'mode', 'position', 'horizonSessions', 20,
    'cutoffAt', '2026-09-18T21:00:00.000Z', 'latestMarketSession', '2026-09-18',
    'modelVersion', 'jev-v1', 'questionVersion', 'questions-v1', 'policyVersion', 'policy-v1',
    'deploymentSha', 'deadbeef'
  ), 'published_c');
END
$$;

DO $$
DECLARE visible_ids text[];
BEGIN
  SET LOCAL ROLE jev_public_reader;
  SELECT array_agg(forecast_id ORDER BY forecast_id) INTO visible_ids FROM read_public_forecasts();
  IF visible_ids IS DISTINCT FROM ARRAY['forecast_a', 'forecast_b']::text[] THEN
    RAISE EXCEPTION 'public read failed transport/provider binding: %', visible_ids;
  END IF;
END
$$;

DO $$
DECLARE replay record;
BEGIN
  SET LOCAL ROLE jev_worker;
  SELECT * INTO replay FROM resolve_forecast(
    '{"id":"resolved_a","forecastId":"forecast_a","type":"resolved","reason":"fixed horizon"}'::jsonb,
    jsonb_build_object('id', 'outcome_a', 'forecastId', 'forecast_a', 'realizedLabel', 'up',
      'adjustedReturn', 0.03, 'brierScore', 0.1, 'logLoss', 0.3, 'sourceBarHash', repeat('5', 64))
  );
  IF NOT replay.created THEN RAISE EXCEPTION 'first resolution must be created'; END IF;
  SELECT * INTO replay FROM resolve_forecast(
    '{"id":"resolved_a","forecastId":"forecast_a","type":"resolved","reason":"fixed horizon"}'::jsonb,
    jsonb_build_object('id', 'outcome_a', 'forecastId', 'forecast_a', 'realizedLabel', 'up',
      'adjustedReturn', 0.03, 'brierScore', 0.1, 'logLoss', 0.3, 'sourceBarHash', repeat('5', 64))
  );
  IF replay.created OR replay.outcome_id <> 'outcome_a' THEN RAISE EXCEPTION 'identical resolution retry must replay'; END IF;
  BEGIN
    PERFORM * FROM resolve_forecast(
      '{"id":"resolved_a","forecastId":"forecast_a","type":"resolved","reason":"changed"}'::jsonb,
      jsonb_build_object('id', 'outcome_a', 'forecastId', 'forecast_a', 'realizedLabel', 'up',
        'adjustedReturn', 0.03, 'sourceBarHash', repeat('5', 64))
    );
    RAISE EXCEPTION 'conflicting resolution retry must fail';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  PERFORM * FROM resolve_forecast(
    '{"id":"resolved_b","forecastId":"forecast_b","type":"resolved","reason":"fixed horizon"}'::jsonb,
    jsonb_build_object('id', 'outcome_b', 'forecastId', 'forecast_b', 'realizedLabel', 'down',
      'adjustedReturn', -0.03, 'sourceBarHash', repeat('6', 64))
  );
  BEGIN
    PERFORM * FROM correct_forecast_outcome(
      '{"id":"bad_numeric_event","forecastId":"forecast_a","type":"correction","reason":"provider revision","referencesEventId":"resolved_a"}'::jsonb,
      jsonb_build_object('id', 'bad_numeric_outcome', 'forecastId', 'forecast_a', 'realizedLabel', 'flat',
        'adjustedReturn', '0.005', 'sourceBarHash', repeat('9', 64),
        'correctionOfOutcomeId', 'outcome_a', 'correctionReason', 'provider revision')
    );
    RAISE EXCEPTION 'numeric outcome strings must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'numeric outcome strings must fail' THEN RAISE; END IF;
  END;
END
$$;

SET ROLE jev_public_ingest;
SELECT * FROM record_visitor_pick(
  'pick_a', 'identifier_pick_a', repeat('7', 64), clock_timestamp() + interval '1 day', 'forecast_a', 'up'
);
RESET ROLE;

DO $$
BEGIN
  SET LOCAL ROLE jev_worker;
  PERFORM append_visitor_pick_result('{"id":"pick_result_a","visitorPickId":"pick_a","outcomeId":"outcome_a"}'::jsonb);
  BEGIN
    PERFORM append_visitor_pick_result('{"id":"pick_result_cross","visitorPickId":"pick_a","outcomeId":"outcome_b"}'::jsonb);
    RAISE EXCEPTION 'cross-forecast pick outcome must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-forecast pick outcome must fail' THEN RAISE; END IF;
  END;
END
$$;

DO $$
DECLARE replay record;
BEGIN
  SET LOCAL ROLE jev_operator;
  SELECT * INTO replay FROM correct_forecast_outcome(
    '{"id":"correction_event_a","forecastId":"forecast_a","type":"correction","reason":"provider revision","referencesEventId":"resolved_a"}'::jsonb,
    jsonb_build_object('id', 'outcome_a2', 'forecastId', 'forecast_a', 'realizedLabel', 'flat',
      'adjustedReturn', 0.005, 'brierScore', 0.2, 'logLoss', 0.5,
      'sourceBarHash', repeat('9', 64), 'correctionOfOutcomeId', 'outcome_a',
      'correctionReason', 'provider revision')
  );
  IF NOT replay.created THEN RAISE EXCEPTION 'first correction must be created'; END IF;
  SELECT * INTO replay FROM correct_forecast_outcome(
    '{"id":"correction_event_a","forecastId":"forecast_a","type":"correction","reason":"provider revision","referencesEventId":"resolved_a"}'::jsonb,
    jsonb_build_object('id', 'outcome_a2', 'forecastId', 'forecast_a', 'realizedLabel', 'flat',
      'adjustedReturn', 0.005, 'brierScore', 0.2, 'logLoss', 0.5,
      'sourceBarHash', repeat('9', 64), 'correctionOfOutcomeId', 'outcome_a',
      'correctionReason', 'provider revision')
  );
  IF replay.created THEN RAISE EXCEPTION 'identical correction retry must replay'; END IF;
END
$$;

DO $$
DECLARE result record;
BEGIN
  SELECT * INTO result FROM visitor_pick_current_results WHERE visitor_pick_id = 'pick_a';
  IF result.active_outcome_id <> 'outcome_a2' OR result.correct THEN
    RAISE EXCEPTION 'visitor result must derive from the corrected active outcome';
  END IF;
END
$$;

DO $$
BEGIN
  SET LOCAL ROLE jev_worker;
  BEGIN
    PERFORM append_market_bar(jsonb_build_object(
      'id', 'bar_numeric_string', 'symbol', 'AAPL', 'provider', 'licensed-provider',
      'sessionDate', '2026-09-19', 'sourceId', 'numeric-string', 'sourceRevision', 'v1',
      'sourceAvailableAt', '2026-09-19T21:30:00.000Z', 'unadjustedOpen', '100',
      'unadjustedHigh', 102, 'unadjustedLow', 99, 'unadjustedClose', 101,
      'adjustedOpen', 100, 'adjustedHigh', 102, 'adjustedLow', 99,
      'adjustedClose', 101, 'volume', 1000, 'sourceHash', repeat('a', 64)
    ));
    RAISE EXCEPTION 'numeric bar strings must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'numeric bar strings must fail' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM append_paper_event('{"id":"paper_bad","type":"deposit","cashDelta":"100000","sharesDelta":0}'::jsonb);
    RAISE EXCEPTION 'numeric paper strings must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'numeric paper strings must fail' THEN RAISE; END IF;
  END;
END
$$;

DO $$
DECLARE existing_id text;
BEGIN
  SET LOCAL ROLE jev_worker;
  existing_id := append_job_operation('{"id":"job_1","operationKey":"publish:AAPL:2026-09-18","operationType":"publication"}'::jsonb);
  IF append_job_operation('{"id":"job_1","operationKey":"publish:AAPL:2026-09-18","operationType":"publication"}'::jsonb) <> existing_id THEN
    RAISE EXCEPTION 'job operation retry must return existing ID';
  END IF;
  BEGIN
    PERFORM append_job_operation('{"id":"job_1","operationKey":"publish:AAPL:2026-09-18","operationType":"resolution"}'::jsonb);
    RAISE EXCEPTION 'conflicting job operation retry must fail';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  PERFORM append_job_attempt('{"id":"attempt_1","operationId":"job_1","attemptNumber":1,"details":{"source":"cron"}}'::jsonb, 'attempt_1_scheduled');
  PERFORM append_job_attempt('{"id":"attempt_1","operationId":"job_1","attemptNumber":1,"details":{"source":"cron"}}'::jsonb, 'attempt_1_scheduled');
  PERFORM append_job_attempt_event('{"id":"attempt_1_evaluating","attemptId":"attempt_1","status":"evaluating"}'::jsonb);
  PERFORM append_job_attempt_event('{"id":"attempt_1_evaluating","attemptId":"attempt_1","status":"evaluating"}'::jsonb);
  BEGIN
    PERFORM append_job_attempt_event('{"id":"attempt_1_evaluating","attemptId":"attempt_1","status":"failed","errorCode":"CONFLICT"}'::jsonb);
    RAISE EXCEPTION 'conflicting attempt event retry must fail';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  PERFORM append_job_attempt_event('{"id":"attempt_1_succeeded","attemptId":"attempt_1","status":"succeeded"}'::jsonb);
END
$$;

SELECT 'ledger_foundation_ok' AS result;
