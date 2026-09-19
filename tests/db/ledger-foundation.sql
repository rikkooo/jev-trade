\set ON_ERROR_STOP on

DO $$
BEGIN
  IF has_table_privilege('jev_worker', 'forecasts', 'INSERT')
    OR has_table_privilege('jev_operator', 'provider_rights', 'INSERT')
    OR has_table_privilege('jev_public_ingest', 'analytics_events', 'INSERT')
  THEN
    RAISE EXCEPTION 'application roles must not mutate ledger tables directly';
  END IF;
  IF NOT has_function_privilege('jev_worker', 'append_market_snapshot(jsonb,jsonb,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('jev_operator', 'append_provider_rights(jsonb)', 'EXECUTE')
    OR has_function_privilege('jev_worker', 'append_forecast_correction_event(jsonb)', 'EXECUTE')
    OR has_function_privilege('jev_public_ingest', 'publish_forecast(jsonb,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'ledger procedure role matrix is incorrect';
  END IF;
END
$$;

SET ROLE jev_operator;
SELECT upsert_symbol('{"symbol":"AAPL","exchange":"XNAS","currency":"USD","benchmarkSymbol":"SPY","enabled":true}'::jsonb);
SELECT upsert_symbol('{"symbol":"SPY","exchange":"ARCX","currency":"USD","benchmarkSymbol":"SPY","enabled":true}'::jsonb);
SELECT append_provider_rights(
  jsonb_build_object(
    'id', 'rights_1', 'provider', 'licensed-provider',
    'planOrContract', 'contract-v1',
    'permittedFields', jsonb_build_array('daily_ohlcv', 'corporate_actions'),
    'audience', 'public', 'retention', 'contract-defined',
    'attribution', 'Licensed Provider', 'derivedOutputs', true,
    'screenshotsAndVideo', true, 'onwardAiProcessing', true,
    'effectiveFrom', '2026-09-01T00:00:00.000Z',
    'reviewedBy', 'operator', 'evidenceHash', repeat('a', 64)
  )
);
SELECT append_processor_terms(
  jsonb_build_object(
    'id', 'terms_1', 'processor', 'openrouter-jev', 'retention', 'none',
    'training', 'disabled', 'residency', 'us', 'deletion', 'supported',
    'effectiveFrom', '2026-09-01T00:00:00.000Z',
    'reviewedBy', 'operator', 'evidenceHash', repeat('b', 64)
  )
);
RESET ROLE;

DO $$
DECLARE
  gate record;
BEGIN
  SELECT * INTO gate FROM public_mode_gate(
    '2026-09-19T12:00:00.000Z', 'licensed-provider', 'openrouter-jev',
    ARRAY['daily_ohlcv']
  );
  IF NOT gate.allowed THEN RAISE EXCEPTION 'exact public-mode gate should pass'; END IF;

  SELECT * INTO gate FROM public_mode_gate(
    '2026-09-19T12:00:00.000Z', 'wrong-provider', 'openrouter-jev',
    ARRAY['daily_ohlcv']
  );
  IF gate.allowed OR gate.blockers <> ARRAY['PROVIDER_RIGHTS_MISSING'] THEN
    RAISE EXCEPTION 'provider mismatch must fail closed';
  END IF;

  SELECT * INTO gate FROM public_mode_gate(
    '2026-09-19T12:00:00.000Z', 'licensed-provider', 'wrong-processor',
    ARRAY['daily_ohlcv']
  );
  IF gate.allowed OR gate.blockers <> ARRAY['PROCESSOR_TERMS_MISSING'] THEN
    RAISE EXCEPTION 'processor mismatch must fail closed';
  END IF;

  SELECT * INTO gate FROM public_mode_gate(
    '2026-09-19T12:00:00.000Z', 'licensed-provider', 'openrouter-jev',
    ARRAY['daily_ohlcv', 'trades']
  );
  IF gate.allowed OR gate.blockers <> ARRAY['PROVIDER_RIGHTS_MISSING'] THEN
    RAISE EXCEPTION 'missing required field must fail closed';
  END IF;
END
$$;

SET ROLE jev_worker;
SELECT append_market_bar(
  jsonb_build_object(
    'id', 'bar_aapl', 'symbol', 'AAPL', 'provider', 'licensed-provider',
    'sessionDate', '2026-09-18', 'sourceId', 'eod:AAPL:2026-09-18',
    'sourceRevision', 'v1', 'sourceAvailableAt', '2026-09-18T21:30:00.000Z',
    'unadjustedOpen', 100, 'unadjustedHigh', 102, 'unadjustedLow', 99,
    'unadjustedClose', 101, 'adjustedOpen', 100, 'adjustedHigh', 102,
    'adjustedLow', 99, 'adjustedClose', 101, 'volume', 1000000,
    'sourceHash', repeat('c', 64)
  )
);
SELECT append_market_bar(
  jsonb_build_object(
    'id', 'bar_spy', 'symbol', 'SPY', 'provider', 'licensed-provider',
    'sessionDate', '2026-09-18', 'sourceId', 'eod:SPY:2026-09-18',
    'sourceRevision', 'v1', 'sourceAvailableAt', '2026-09-18T21:31:00.000Z',
    'unadjustedOpen', 500, 'unadjustedHigh', 502, 'unadjustedLow', 499,
    'unadjustedClose', 501, 'adjustedOpen', 500, 'adjustedHigh', 502,
    'adjustedLow', 499, 'adjustedClose', 501, 'volume', 2000000,
    'sourceHash', repeat('d', 64)
  )
);
SELECT append_market_snapshot(
  jsonb_build_object(
    'id', 'snapshot_1', 'symbol', 'AAPL', 'provider', 'licensed-provider',
    'cutoffAt', '2026-09-18T21:00:00.000Z',
    'knowledgeCutoffAt', '2026-09-18T23:00:00.000Z',
    'providerFetchedAt', '2026-09-18T22:00:00.000Z',
    'sourceUpdatedAt', '2026-09-18T21:31:00.000Z',
    'latestMarketSession', '2026-09-18',
    'sourceManifest', jsonb_build_array(
      jsonb_build_object(
        'sourceId', 'eod:AAPL:2026-09-18', 'sourceRevision', 'v1',
        'sourceHash', repeat('c', 64),
        'availableAt', '2026-09-18T21:30:00.000Z'
      ),
      jsonb_build_object(
        'sourceId', 'eod:SPY:2026-09-18', 'sourceRevision', 'v1',
        'sourceHash', repeat('d', 64),
        'availableAt', '2026-09-18T21:31:00.000Z'
      )
    ),
    'state', jsonb_build_object('risk', 41), 'contentHash', repeat('e', 64)
  ),
  '[{"barId":"bar_aapl","role":"symbol","ordinal":0},{"barId":"bar_spy","role":"benchmark","ordinal":0}]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'id', 'evidence_1', 'sourceId', 'eod:AAPL:2026-09-18',
      'descriptor', jsonb_build_object('trend', 'up'),
      'contentHash', repeat('4', 64)
    )
  )
);
SELECT append_market_bar(
  jsonb_build_object(
    'id', 'bar_future_revision', 'symbol', 'AAPL',
    'provider', 'licensed-provider', 'sessionDate', '2026-09-18',
    'sourceId', 'eod:AAPL:2026-09-18', 'sourceRevision', 'v2',
    'sourceAvailableAt', '2026-09-18T23:00:00.001Z',
    'unadjustedOpen', 100, 'unadjustedHigh', 103, 'unadjustedLow', 99,
    'unadjustedClose', 102, 'adjustedOpen', 100, 'adjustedHigh', 103,
    'adjustedLow', 99, 'adjustedClose', 102, 'volume', 1000000,
    'sourceHash', repeat('2', 64)
  )
);
RESET ROLE;

DO $$
DECLARE
  rejected boolean := false;
BEGIN
  SET LOCAL ROLE jev_worker;
  BEGIN
    PERFORM append_market_snapshot(
      jsonb_build_object(
        'id', 'snapshot_future_revision', 'symbol', 'AAPL',
        'provider', 'licensed-provider',
        'cutoffAt', '2026-09-18T21:00:00.000Z',
        'knowledgeCutoffAt', '2026-09-18T23:00:00.000Z',
        'providerFetchedAt', '2026-09-18T22:00:00.000Z',
        'sourceUpdatedAt', '2026-09-18T21:31:00.000Z',
        'latestMarketSession', '2026-09-18',
        'sourceManifest', jsonb_build_array(
          jsonb_build_object(
            'sourceId', 'eod:AAPL:2026-09-18', 'sourceRevision', 'v1',
            'sourceHash', repeat('c', 64),
            'availableAt', '2026-09-18T21:30:00.000Z'
          )
        ), 'state', '{}'::jsonb,
        'contentHash', repeat('3', 64)
      ),
      '[{"barId":"bar_future_revision","role":"symbol","ordinal":0}]'::jsonb,
      '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'post-cutoff provider revision must be rejected';
  END IF;
END
$$;

SET ROLE jev_worker;
SELECT append_judgment_run(
  jsonb_build_object(
    'id', 'judgment_1', 'snapshotId', 'snapshot_1', 'provider', 'openrouter',
    'modelVersion', 'typesafe/jev-1.13-20260917',
    'questionVersion', 'questions-v1', 'status', 'succeeded',
    'typedResponse', jsonb_build_object('direction', 'up'),
    'contentHash', repeat('f', 64),
    'startedAt', '2026-09-18T22:05:00.000Z',
    'completedAt', '2026-09-18T22:05:01.000Z'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'answer_1', 'answerId', 'direction', 'primitive', 'choice',
      'selectedOption', 'up',
      'distribution', jsonb_build_object('up', 0.7, 'flat', 0.2, 'down', 0.1),
      'confidence', 0.7
    )
  )
);
SELECT append_policy_decision(
  jsonb_build_object(
    'id', 'policy_1', 'judgmentId', 'judgment_1',
    'policyVersion', 'policy-v1', 'action', 'enter',
    'gateTrace', jsonb_build_object('eligible', true),
    'sizing', jsonb_build_object('shares', 10), 'contentHash', repeat('1', 64)
  )
);
SELECT * FROM publish_forecast(
  jsonb_build_object(
    'id', 'forecast_1', 'publicationKey', 'AAPL:2026-09-18:position:v1',
    'snapshotId', 'snapshot_1', 'judgmentId', 'judgment_1',
    'policyDecisionId', 'policy_1', 'symbol', 'AAPL', 'mode', 'position',
    'horizonSessions', 20, 'cutoffAt', '2026-09-18T21:00:00.000Z',
    'latestMarketSession', '2026-09-18',
    'modelVersion', 'typesafe/jev-1.13-20260917',
    'questionVersion', 'questions-v1', 'policyVersion', 'policy-v1',
    'deploymentSha', 'deadbeef'
  ),
  'forecast_event_1'
);
RESET ROLE;

DO $$
DECLARE
  replay record;
  rejected boolean := false;
BEGIN
  SET LOCAL ROLE jev_worker;
  SELECT * INTO replay FROM publish_forecast(
    jsonb_build_object(
      'id', 'forecast_1', 'publicationKey', 'AAPL:2026-09-18:position:v1',
      'snapshotId', 'snapshot_1', 'judgmentId', 'judgment_1',
      'policyDecisionId', 'policy_1', 'symbol', 'AAPL', 'mode', 'position',
      'horizonSessions', 20, 'cutoffAt', '2026-09-18T21:00:00.000Z',
      'latestMarketSession', '2026-09-18',
      'modelVersion', 'typesafe/jev-1.13-20260917',
      'questionVersion', 'questions-v1', 'policyVersion', 'policy-v1',
      'deploymentSha', 'deadbeef'
    ),
    'forecast_event_1'
  );
  IF replay.created OR replay.forecast_id <> 'forecast_1' THEN
    RAISE EXCEPTION 'identical publication retry must return the existing row';
  END IF;

  BEGIN
    PERFORM * FROM publish_forecast(
      jsonb_build_object(
        'id', 'forecast_1', 'publicationKey', 'AAPL:2026-09-18:position:v1',
        'snapshotId', 'snapshot_1', 'judgmentId', 'judgment_1',
        'policyDecisionId', 'policy_1', 'symbol', 'AAPL', 'mode', 'position',
        'horizonSessions', 5, 'cutoffAt', '2026-09-18T21:00:00.000Z',
        'latestMarketSession', '2026-09-18',
        'modelVersion', 'typesafe/jev-1.13-20260917',
        'questionVersion', 'questions-v1', 'policyVersion', 'policy-v1',
        'deploymentSha', 'deadbeef'
      ),
      'forecast_event_1'
    );
  EXCEPTION WHEN unique_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'conflicting publication retry must fail';
  END IF;
END
$$;

DO $$
DECLARE
  rejected boolean := false;
BEGIN
  SET LOCAL ROLE jev_worker;
  BEGIN
    PERFORM append_forecast_outcome(
      jsonb_build_object(
        'id', 'outcome_too_early', 'forecastId', 'forecast_1',
        'realizedLabel', 'up', 'adjustedReturn', 0.03,
        'sourceBarHash', repeat('5', 64)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'outcome before forecast resolution must fail';
  END IF;
END
$$;

SET ROLE jev_worker;
SELECT append_forecast_terminal_event(
  '{"id":"forecast_resolved_1","forecastId":"forecast_1","type":"resolved","reason":"fixed horizon"}'::jsonb
);
SELECT append_forecast_outcome(
  jsonb_build_object(
    'id', 'outcome_1', 'forecastId', 'forecast_1', 'realizedLabel', 'up',
    'adjustedReturn', 0.03, 'brierScore', 0.1, 'logLoss', 0.3,
    'sourceBarHash', repeat('5', 64)
  )
);
SELECT append_paper_event(
  '{"id":"paper_deposit_1","type":"deposit","cashDelta":100000,"sharesDelta":0}'::jsonb
);
SELECT append_ledger_root(
  jsonb_build_object(
    'id', 'root_1', 'batchKey', '2026-09-18', 'rootHash', repeat('6', 64),
    'attestationDeadline', '2026-09-20T00:00:00.000Z'
  )
);
RESET ROLE;

SET ROLE jev_public_ingest;
SELECT * FROM record_visitor_pick(
  'pick_1', 'identifier_pick_1', repeat('7', 64),
  '2026-10-01T00:00:00.000Z', 'forecast_1', 'up'
);
SELECT record_analytics_event(
  'analytics_1', true, 'identifier_analytics_1', repeat('8', 64),
  '2026-10-01T00:00:00.000Z', 'reveal', 'AAPL', 'forecast_1'
);
RESET ROLE;

SET ROLE jev_operator;
SELECT append_forecast_outcome_correction(
  jsonb_build_object(
    'id', 'outcome_2', 'forecastId', 'forecast_1', 'realizedLabel', 'flat',
    'adjustedReturn', 0.005, 'brierScore', 0.2, 'logLoss', 0.5,
    'sourceBarHash', repeat('9', 64),
    'correctionOfOutcomeId', 'outcome_1',
    'correctionReason', 'provider revision'
  )
);
SELECT append_forecast_correction_event(
  '{"id":"forecast_correction_1","forecastId":"forecast_1","type":"correction","reason":"provider revision","referencesEventId":"forecast_resolved_1"}'::jsonb
);
SELECT append_paper_correction(
  '{"id":"paper_correction_1","type":"correction","cashDelta":-100000,"sharesDelta":0,"correctionOfEventId":"paper_deposit_1","reason":"operator correction"}'::jsonb
);
RESET ROLE;

SET ROLE jev_worker;
SELECT append_visitor_pick_result(
  '{"id":"pick_result_1","visitorPickId":"pick_1","outcomeId":"outcome_2","correct":false}'::jsonb
);
SELECT purge_expired_identifiers('expiry_run_1', '2026-09-01T00:00:00.000Z');
RESET ROLE;

SET ROLE jev_worker;
SELECT append_job_operation('{"id":"job_1","operationKey":"publish:AAPL:2026-09-18","operationType":"publication"}'::jsonb);
SELECT append_job_attempt('{"id":"attempt_1","operationId":"job_1","attemptNumber":1}'::jsonb, 'attempt_1_scheduled');
SELECT append_job_attempt_event('{"id":"attempt_1_evaluating","attemptId":"attempt_1","status":"evaluating"}'::jsonb);
SELECT append_job_attempt_event('{"id":"attempt_1_succeeded","attemptId":"attempt_1","status":"succeeded"}'::jsonb);
RESET ROLE;

DO $$
DECLARE
  rejected boolean := false;
BEGIN
  SET LOCAL ROLE jev_worker;
  BEGIN
    PERFORM append_job_attempt_event(
      '{"id":"attempt_1_failed","attemptId":"attempt_1","status":"failed","errorCode":"LATE_FAILURE"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'second terminal state must fail'; END IF;
END
$$;

SELECT 'ledger_foundation_ok' AS result;
