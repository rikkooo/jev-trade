\set ON_ERROR_STOP on

-- Phase Two denial suite (#15). Run as the migration owner on a disposable
-- database after `pnpm db:migrate`. It leaves no rows behind: every probe
-- that could write runs inside a block that is rolled back.

CREATE FUNCTION pg_temp.p2_expected_grants(p_function text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_function
    WHEN 'p2_append_registry_entry' THEN ARRAY['jev_operator']
    WHEN 'p2_append_registry_event' THEN ARRAY['jev_operator']
    WHEN 'p2_append_cohort' THEN ARRAY['jev_operator']
    WHEN 'p2_append_cohort_event' THEN ARRAY['jev_operator']
    WHEN 'p2_append_rejected_operator_command' THEN ARRAY['jev_operator']
    WHEN 'p2_record_first_forecast_lock' THEN ARRAY['jev_worker']
    WHEN 'p2_append_source_revision' THEN ARRAY['jev_worker']
    WHEN 'p2_append_evidence_state' THEN ARRAY['jev_worker']
    WHEN 'p2_append_publication_receipt' THEN ARRAY['jev_worker']
    WHEN 'p2_read_registry_entry_status' THEN ARRAY['jev_worker', 'jev_operator']
    WHEN 'p2_read_cohort_status' THEN ARRAY['jev_worker', 'jev_operator']
    WHEN 'p2_read_source_revisions_as_of' THEN ARRAY['jev_worker']
    WHEN 'p2_read_evidence_state' THEN ARRAY['jev_worker']
    WHEN 'p2_read_receipt_authority' THEN ARRAY['jev_worker', 'jev_operator']
    ELSE ARRAY[]::text[]
  END
$$;

-- Runs p_sql as p_role and requires one of the '|'-separated SQLSTATEs.
CREATE FUNCTION pg_temp.p2_expect_error(p_role text, p_sql text, p_sqlstate text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  observed text;
BEGIN
  IF p_role IS NOT NULL THEN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
  END IF;
  BEGIN
    EXECUTE p_sql;
    observed := 'no error';
  EXCEPTION WHEN OTHERS THEN
    observed := SQLSTATE;
  END;
  RESET ROLE;
  IF NOT observed = ANY(string_to_array(p_sqlstate, '|')) THEN
    RAISE EXCEPTION 'expected SQLSTATE % for % running "%", observed %',
      p_sqlstate, COALESCE(p_role, current_user), p_sql, observed;
  END IF;
END
$$;

-- 1. Static privilege matrix for the four runtime roles and PUBLIC.
DO $$
DECLARE
  runtime_role text;
  relation record;
  privilege text;
  fn record;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY[
    'jev_public_reader', 'jev_public_ingest', 'jev_worker', 'jev_operator'
  ] LOOP
    FOR relation IN
      SELECT c.oid, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'p2\_%' AND c.relkind IN ('r', 'S', 'v')
    LOOP
      IF relation.relkind = 'S' THEN
        FOREACH privilege IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
          IF has_sequence_privilege(runtime_role, relation.oid, privilege) THEN
            RAISE EXCEPTION '% holds % on sequence %', runtime_role, privilege, relation.relname;
          END IF;
        END LOOP;
      ELSE
        FOREACH privilege IN ARRAY ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ] LOOP
          IF has_table_privilege(runtime_role, relation.oid, privilege) THEN
            RAISE EXCEPTION '% holds % on %', runtime_role, privilege, relation.relname;
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    FOR fn IN
      SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'p2\_%'
    LOOP
      IF has_function_privilege(runtime_role, fn.oid, 'EXECUTE')
        IS DISTINCT FROM (runtime_role = ANY(pg_temp.p2_expected_grants(fn.proname)))
      THEN
        RAISE EXCEPTION 'unexpected EXECUTE state for % on %', runtime_role, fn.proname;
      END IF;
    END LOOP;

    IF pg_has_role(runtime_role, current_user, 'MEMBER')
      OR EXISTS (
        SELECT 1 FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        WHERE member.rolname = runtime_role
      )
    THEN
      RAISE EXCEPTION '% can assume another role, including the migration owner', runtime_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public' AND p.proname LIKE 'p2\_%' AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute a Phase Two function';
  END IF;
  IF (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'p2\_%'
      AND cardinality(pg_temp.p2_expected_grants(p.proname)) > 0
  ) <> 14 THEN
    RAISE EXCEPTION 'the Phase Two capability matrix does not cover exactly 14 granted procedures';
  END IF;
END
$$;

-- 2. Every runtime role is refused every Phase Two table directly.
DO $$
DECLARE
  runtime_role text;
  relation text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY[
    'jev_public_reader', 'jev_public_ingest', 'jev_worker', 'jev_operator'
  ] LOOP
    FOR relation IN
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'p2\_%' AND c.relkind = 'r'
    LOOP
      PERFORM pg_temp.p2_expect_error(runtime_role, format('SELECT 1 FROM %I LIMIT 1', relation), '42501');
      PERFORM pg_temp.p2_expect_error(runtime_role, format('DELETE FROM %I', relation), '42501');
      PERFORM pg_temp.p2_expect_error(runtime_role, format('TRUNCATE %I', relation), '42501');
    END LOOP;
    PERFORM pg_temp.p2_expect_error(
      runtime_role, 'INSERT INTO p2_source_revisions (id) VALUES (''probe'')', '42501'
    );
    PERFORM pg_temp.p2_expect_error(
      runtime_role, 'GRANT SELECT ON p2_evidence_states TO jev_public_reader', '42501'
    );
    PERFORM pg_temp.p2_expect_error(
      runtime_role, 'CREATE TABLE p2_probe_owned (id text)', '42501'
    );
  END LOOP;
END
$$;

-- 3. Every runtime role is refused every Phase Two function outside its
--    declared capabilities: other roles' procedures and all internals.
DO $$
DECLARE
  runtime_role text;
  fn record;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY[
    'jev_public_reader', 'jev_public_ingest', 'jev_worker', 'jev_operator'
  ] LOOP
    FOR fn IN
      SELECT p.proname,
             -- Non-null samples: a STRICT call with NULLs is folded away
             -- before the ACL check and would prove nothing.
             (SELECT string_agg(
                CASE format_type(argument.type, NULL)
                  WHEN 'jsonb' THEN '''{}''::jsonb'
                  WHEN 'text' THEN '''probe''::text'
                  WHEN 'text[]' THEN '''{}''::text[]'
                  WHEN 'integer' THEN '1'
                  WHEN 'boolean' THEN 'false'
                  WHEN 'timestamp with time zone' THEN 'now()'
                  ELSE format('NULL::%s', format_type(argument.type, NULL))
                END, ', ' ORDER BY argument.position)
              FROM unnest(p.proargtypes) WITH ORDINALITY AS argument(type, position)) AS sample_arguments
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'p2\_%'
        AND p.prorettype <> 'trigger'::regtype
    LOOP
      IF NOT runtime_role = ANY(pg_temp.p2_expected_grants(fn.proname)) THEN
        PERFORM pg_temp.p2_expect_error(
          runtime_role,
          format('SELECT public.%I(%s)', fn.proname, COALESCE(fn.sample_arguments, '')),
          '42501'
        );
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- 4. The migration owner cannot rewrite evidence either: every Phase Two
--    table rejects UPDATE, DELETE, and TRUNCATE through its trigger.
DO $$
DECLARE
  relation record;
BEGIN
  FOR relation IN
    SELECT c.relname,
           (SELECT a.attname FROM pg_attribute a
            WHERE a.attrelid = c.oid AND a.attnum = 1) AS first_column
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'p2\_%' AND c.relkind = 'r'
  LOOP
    PERFORM pg_temp.p2_expect_error(
      NULL, format('UPDATE %I SET %I = %I', relation.relname, relation.first_column, relation.first_column), '55000'
    );
    PERFORM pg_temp.p2_expect_error(NULL, format('DELETE FROM %I', relation.relname), '55000');
    -- A table still referenced by another Phase Two table is refused by its
    -- foreign keys (0A000) before the trigger; either way nothing is removed.
    PERFORM pg_temp.p2_expect_error(NULL, format('TRUNCATE %I', relation.relname), '55000|0A000');
  END LOOP;
END
$$;

-- 5. Row and commit-time triggers still hold when the owner bypasses the
--    procedures with direct inserts. Each probe is rolled back.
DO $$
DECLARE
  observed text;
  state_hash text := p2_sha256_hex(p2_canonical_json(
    '{"recipe":"jev-evidence-lab-normalized-state/v1","state":{"probe":true}}'::jsonb
  ));
BEGIN
  -- A source available after the state's cutoff cannot be admitted.
  BEGIN
    INSERT INTO p2_source_revisions (
      id, source_id, revision, source_kind, origin, subject, payload_hash,
      disclosure_class, published_at, effective_at, ingested_at, available_at,
      canonical_payload, content_hash
    ) VALUES (
      'probe-late-source', 'probe-feed', 'r1', 'BAR', 'FIXTURE', 'AAPL', repeat('a', 64),
      'PUBLIC', '2026-09-18T14:30:00Z', '2026-09-18T14:30:00Z', '2026-09-18T14:30:00Z',
      '2026-09-18T14:30:00Z', '{}', repeat('b', 64)
    );
    INSERT INTO p2_evidence_states (
      id, pack, mode, subject, cutoff_at, normalized_state, normalized_state_hash,
      admission_manifest_hash, canonical_payload, content_hash
    ) VALUES (
      'probe-state', 'day', 'fixture', 'AAPL', '2026-09-18T14:00:00Z', '{"probe":true}',
      state_hash, repeat('c', 64), '{}', repeat('d', 64)
    );
    INSERT INTO p2_evidence_state_admissions VALUES ('probe-state', 'probe-late-source', repeat('b', 64));
    observed := 'no error';
    RAISE EXCEPTION 'probe-rollback';
  EXCEPTION WHEN OTHERS THEN
    observed := COALESCE(NULLIF(observed, 'no error'), SQLERRM);
  END;
  IF observed NOT LIKE '%available after its cutoff%' THEN
    RAISE EXCEPTION 'late admission was not rejected: %', observed;
  END IF;

  -- A prospective state is gated even for the owner.
  observed := NULL;
  BEGIN
    INSERT INTO p2_source_revisions (
      id, source_id, revision, source_kind, origin, subject, payload_hash,
      disclosure_class, published_at, effective_at, ingested_at, available_at,
      canonical_payload, content_hash
    ) VALUES (
      'probe-source', 'probe-feed', 'r1', 'BAR', 'FIXTURE', 'AAPL', repeat('a', 64),
      'PUBLIC', '2026-09-18T13:30:00Z', '2026-09-18T13:30:00Z', '2026-09-18T13:30:00Z',
      '2026-09-18T13:30:00Z', '{}', repeat('b', 64)
    );
    INSERT INTO p2_evidence_states (
      id, pack, mode, subject, cutoff_at, normalized_state, normalized_state_hash,
      admission_manifest_hash, canonical_payload, content_hash
    ) VALUES (
      'probe-state', 'day', 'prospective', 'AAPL', '2026-09-18T14:00:00Z', '{"probe":true}',
      state_hash, repeat('c', 64), '{}', repeat('d', 64)
    );
    INSERT INTO p2_evidence_state_admissions VALUES ('probe-state', 'probe-source', repeat('b', 64));
    RAISE EXCEPTION 'probe-rollback';
  EXCEPTION WHEN OTHERS THEN
    observed := SQLSTATE;
  END;
  IF observed IS DISTINCT FROM 'JTG01' THEN
    RAISE EXCEPTION 'prospective evidence state was not gated: %', observed;
  END IF;

  -- A live origin cannot even be stored in this schema version.
  observed := NULL;
  BEGIN
    INSERT INTO p2_source_revisions (
      id, source_id, revision, source_kind, origin, subject, payload_hash,
      disclosure_class, published_at, effective_at, ingested_at, available_at,
      canonical_payload, content_hash
    ) VALUES (
      'probe-live', 'probe-feed', 'r1', 'BAR', 'LIVE', 'AAPL', repeat('a', 64),
      'LICENSED', now(), now(), now(), now(), '{}', repeat('b', 64)
    );
  EXCEPTION WHEN check_violation THEN
    observed := SQLSTATE;
  END;
  IF observed IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'a live source origin was accepted';
  END IF;

  -- A state with no admissions fails at commit (deferred trigger).
  observed := NULL;
  BEGIN
    INSERT INTO p2_evidence_states (
      id, pack, mode, subject, cutoff_at, normalized_state, normalized_state_hash,
      admission_manifest_hash, canonical_payload, content_hash
    ) VALUES (
      'probe-empty-state', 'day', 'fixture', 'AAPL', '2026-09-18T14:00:00Z', '{"probe":true}',
      state_hash, repeat('c', 64), '{}', repeat('d', 64)
    );
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'probe-rollback';
  EXCEPTION WHEN OTHERS THEN
    observed := SQLERRM;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF observed NOT LIKE '%at least one source revision%' THEN
    RAISE EXCEPTION 'an empty evidence state was not rejected at commit: %', observed;
  END IF;

  -- A receipt claiming MISSING before its deadline is refused.
  observed := NULL;
  BEGIN
    INSERT INTO p2_publication_receipts (
      id, batch_id, root_hash, sink_id, observation, deadline_at, canonical_payload, content_hash
    ) VALUES (
      'probe-receipt', 'probe-batch', repeat('e', 64), 'probe-sink', 'MISSING',
      now() + interval '1 hour', '{}', repeat('f', 64)
    );
  EXCEPTION WHEN check_violation THEN
    observed := SQLSTATE;
  END;
  IF observed IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'an early MISSING receipt was accepted';
  END IF;
END
$$;

-- 6. Procedures fail closed on malformed or self-asserted input.
DO $$
DECLARE
  payload jsonb := jsonb_build_object(
    'id', 'probe-receipt', 'batchId', 'probe-batch', 'rootHash', repeat('e', 64),
    'sinkId', 'probe-sink', 'observation', 'SINK_RECEIPT',
    'deadlineAt', '2026-09-18T20:00:00.000Z', 'submittedAt', '2026-09-18T19:00:00.000Z',
    'sinkTimestamp', '2026-09-18T19:00:01.000Z', 'proofHash', repeat('1', 64),
    'failureCode', NULL, 'correctsReceiptId', NULL, 'status', 'TIMELY'
  );
  canonical text;
BEGIN
  canonical := p2_canonical_json(jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'publication_receipt', 'payload', payload
  ));
  PERFORM pg_temp.p2_expect_error(
    'jev_worker',
    format('SELECT * FROM p2_append_publication_receipt(%L::jsonb)',
      payload || jsonb_build_object('canonicalPayload', canonical, 'contentHash', p2_sha256_hex(canonical))),
    '22023'
  );
  -- The same payload with a non-canonical encoding of identical content.
  payload := payload - 'status';
  canonical := p2_canonical_json(jsonb_build_object(
    'recipe', 'jev-evidence-lab-canonical-json/v1', 'kind', 'publication_receipt', 'payload', payload
  ));
  PERFORM pg_temp.p2_expect_error(
    'jev_worker',
    format('SELECT * FROM p2_append_publication_receipt(%L::jsonb)',
      payload || jsonb_build_object(
        'canonicalPayload', replace(canonical, ',', ', '),
        'contentHash', p2_sha256_hex(replace(canonical, ',', ', '))
      )),
    '22023'
  );
  -- An operator has no path to attest a receipt at all.
  PERFORM pg_temp.p2_expect_error(
    'jev_operator',
    format('SELECT * FROM p2_append_publication_receipt(%L::jsonb)',
      payload || jsonb_build_object('canonicalPayload', canonical, 'contentHash', p2_sha256_hex(canonical))),
    '42501'
  );
END
$$;

SELECT 'evidence-lab-foundation denial suite passed' AS result;
