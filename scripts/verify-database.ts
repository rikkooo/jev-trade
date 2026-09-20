import { pathToFileURL } from "node:url";

import postgres from "postgres";

import {
  loadMigrationManifest,
  redactDatabaseError,
  requireMigrationUrl,
} from "./migrate";

const APPLICATION_ROLES = [
  "jev_public_reader",
  "jev_public_ingest",
  "jev_worker",
  "jev_operator",
] as const;
const APPLICATION_ROLE_SET: ReadonlySet<string> = new Set(APPLICATION_ROLES);

const BASE_TABLES = [
  "schema_migrations",
  "symbols",
  "provider_rights",
  "processor_terms",
  "market_bars",
  "market_snapshots",
  "snapshot_bar_refs",
  "evidence_descriptors",
  "judgment_runs",
  "judgment_answers",
  "policy_decisions",
  "forecasts",
  "forecast_events",
  "forecast_outcomes",
  "paper_events",
  "job_operations",
  "job_attempts",
  "job_attempt_events",
  "ledger_roots",
  "private_identifiers",
  "visitor_picks",
  "visitor_pick_results",
  "analytics_events",
  "identifier_expiry_runs",
  "p2_registry_entries",
  "p2_registry_events",
  "p2_cohorts",
  "p2_cohort_events",
  "p2_source_revisions",
  "p2_evidence_states",
  "p2_operator_audit_events",
  "p2_publication_receipts",
] as const;

const VIEWS = [
  "forecast_current_states",
  "active_forecast_outcomes",
  "visitor_pick_current_results",
  "paper_position_projection",
  "analytics_aggregate",
  "p2_public_evidence_projection",
] as const;

const IMMUTABLE_TABLES = [
  "provider_rights",
  "processor_terms",
  "market_bars",
  "market_snapshots",
  "snapshot_bar_refs",
  "evidence_descriptors",
  "judgment_runs",
  "judgment_answers",
  "policy_decisions",
  "forecasts",
  "forecast_events",
  "forecast_outcomes",
  "paper_events",
  "job_operations",
  "job_attempts",
  "job_attempt_events",
  "ledger_roots",
  "visitor_picks",
  "visitor_pick_results",
  "analytics_events",
  "identifier_expiry_runs",
  "p2_registry_entries",
  "p2_registry_events",
  "p2_cohorts",
  "p2_cohort_events",
  "p2_source_revisions",
  "p2_evidence_states",
  "p2_operator_audit_events",
  "p2_publication_receipts",
] as const;

const LIFECYCLE_TRIGGERS = new Map([
  ["forecast_events", "forecast_event_lifecycle"],
  ["forecasts", "forecast_dependency_match"],
  ["market_snapshots", "market_snapshot_source_cutoff"],
  ["snapshot_bar_refs", "snapshot_bar_reference_cutoff"],
  ["forecast_outcomes", "forecast_outcome_chain"],
  ["job_attempts", "job_attempt_lifecycle"],
  ["job_attempt_events", "job_attempt_event_lifecycle"],
  ["p2_registry_events", "p2_registry_event_lifecycle"],
  ["p2_cohort_events", "p2_cohort_event_lifecycle"],
  ["p2_source_revisions", "p2_source_revision_chain"],
  ["p2_evidence_states", "p2_evidence_state_source_cutoff"],
]);

const CRITICAL_INDEXES = [
  "provider_rights_effective_idx",
  "processor_terms_effective_idx",
  "forecast_one_publication_idx",
  "forecast_one_terminal_idx",
  "forecast_events_timeline_idx",
  "forecast_one_original_outcome_idx",
  "forecast_outcome_one_correction_idx",
  "paper_events_timeline_idx",
  "paper_events_symbol_idx",
  "job_attempt_one_status_idx",
  "job_attempt_one_terminal_idx",
  "job_attempt_timeline_idx",
  "private_identifiers_expiry_idx",
  "analytics_aggregate_idx",
  "p2_registry_events_timeline_idx",
  "p2_cohort_events_timeline_idx",
  "p2_cohort_one_forecast_lock_idx",
  "p2_source_revisions_available_idx",
  "p2_evidence_states_cutoff_idx",
  "p2_publication_receipts_deadline_idx",
] as const;

const FUNCTION_GRANTS = new Map<string, readonly string[]>([
  ["public_mode_gate", ["jev_worker", "jev_operator"]],
  ["read_public_forecasts", ["jev_public_reader"]],
  ["record_visitor_pick", ["jev_public_ingest"]],
  ["record_analytics_event", ["jev_public_ingest"]],
  ["publish_forecast", ["jev_worker"]],
  ["append_market_bar", ["jev_worker"]],
  ["append_market_snapshot", ["jev_worker"]],
  ["append_judgment_run", ["jev_worker"]],
  ["append_policy_decision", ["jev_worker"]],
  ["resolve_forecast", ["jev_worker"]],
  ["void_forecast", ["jev_worker"]],
  ["append_paper_event", ["jev_worker"]],
  ["append_job_operation", ["jev_worker", "jev_operator"]],
  ["append_job_attempt", ["jev_worker", "jev_operator"]],
  ["append_job_attempt_event", ["jev_worker", "jev_operator"]],
  ["append_ledger_root", ["jev_worker"]],
  ["append_visitor_pick_result", ["jev_worker"]],
  ["upsert_symbol", ["jev_operator"]],
  ["append_provider_rights", ["jev_operator"]],
  ["append_processor_terms", ["jev_operator"]],
  ["correct_forecast_outcome", ["jev_operator"]],
  ["append_paper_correction", ["jev_operator"]],
  ["purge_expired_identifiers", ["jev_worker", "jev_operator"]],
  ["p2_append_registry_entry", ["jev_operator"]],
  ["p2_append_registry_event", ["jev_operator"]],
  ["p2_append_cohort", ["jev_operator"]],
  ["p2_append_cohort_event", ["jev_operator"]],
  ["p2_append_source_revision", ["jev_worker", "jev_operator"]],
  ["p2_append_evidence_state", ["jev_worker"]],
  ["p2_append_operator_audit_event", ["jev_operator"]],
  ["p2_append_publication_receipt", ["jev_operator"]],
  ["p2_read_evidence_state", ["jev_worker"]],
]);

const INTERNAL_FUNCTIONS = [
  "reject_immutable_mutation",
  "validate_forecast_event",
  "validate_forecast_dependencies",
  "validate_market_snapshot_sources",
  "validate_snapshot_bar_reference",
  "validate_forecast_outcome",
  "validate_job_attempt",
  "validate_job_attempt_event",
  "assert_json_number",
  "verify_ledger_content_hash",
  "validate_snapshot_history",
  "p2_verify_content_hash",
  "p2_validate_registry_event",
  "p2_validate_cohort_event",
  "p2_validate_source_revision",
  "p2_validate_evidence_state",
] as const;

const SECURITY_DEFINER_FUNCTIONS = [...FUNCTION_GRANTS.keys()];
const PROJECT_FUNCTIONS = new Set([
  ...SECURITY_DEFINER_FUNCTIONS,
  ...INTERNAL_FUNCTIONS,
]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertSameMembers(
  actual: Iterable<string>,
  expected: Iterable<string>,
  message: string,
): void {
  invariant(
    JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected)),
    message,
  );
}

function isAllowedDirectRelationGrant(grant: {
  readonly grantee: string;
  readonly relation_name: string;
  readonly privilege_type: string;
}): boolean {
  return (
    grant.grantee === "jev_public_reader" &&
    grant.relation_name === "p2_public_evidence_projection" &&
    grant.privilege_type === "SELECT"
  );
}

async function verifyDatabase(): Promise<void> {
  const databaseUrl = requireMigrationUrl();
  const manifest = await loadMigrationManifest();
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => undefined,
  });
  const checks: string[] = [];
  let appliedSchemaVersions: string[] = [];

  try {
    await sql.begin(async (transaction) => {
      await transaction`SET TRANSACTION READ ONLY`;

      const extensions = await transaction<{ extname: string }[]>`
        SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'
      `;
      invariant(
        extensions.length === 1,
        "required pgcrypto extension is absent",
      );
      checks.push("extension");

      const registryColumns = await transaction<
        { column_name: string; is_nullable: string }[]
      >`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schema_migrations'
      `;
      assertSameMembers(
        registryColumns.map((column) => column.column_name),
        ["version", "file_name", "checksum", "applied_at", "applied_by"],
        "schema_migrations has an unexpected shape",
      );
      invariant(
        registryColumns.every((column) => column.is_nullable === "NO"),
        "schema_migrations columns must be non-null",
      );

      const appliedRows = await transaction<
        {
          version: string;
          file_name: string;
          checksum: string;
          applied_at: Date;
        }[]
      >`
        SELECT version, file_name, checksum, applied_at
        FROM public.schema_migrations
        ORDER BY version
      `;
      const applied = new Map(appliedRows.map((row) => [row.version, row]));
      appliedSchemaVersions = appliedRows.map((row) => row.version);
      for (const migration of manifest) {
        const row = applied.get(migration.version);
        invariant(
          row,
          `required migration ${migration.version} is not applied`,
        );
        invariant(
          row.file_name === migration.fileName &&
            row.checksum.trim() === migration.checksum,
          `migration ${migration.version} does not match the reviewed source`,
        );
        invariant(
          row.applied_at.getTime() <= Date.now() + 60_000,
          `migration ${migration.version} has an invalid application time`,
        );
      }
      checks.push("migration-registry");

      const relations = await transaction<
        { relation_name: string; relation_kind: string; owner_name: string }[]
      >`
        SELECT c.relname AS relation_name, c.relkind AS relation_kind,
               owner.rolname AS owner_name
        FROM pg_class c
        JOIN pg_namespace namespace ON namespace.oid = c.relnamespace
        JOIN pg_roles owner ON owner.oid = c.relowner
        WHERE namespace.nspname = 'public' AND c.relkind IN ('r', 'v')
      `;
      const relationMap = new Map(
        relations.map((relation) => [relation.relation_name, relation]),
      );
      for (const table of BASE_TABLES) {
        invariant(
          relationMap.get(table)?.relation_kind === "r",
          `required table ${table} is absent`,
        );
      }
      for (const view of VIEWS) {
        invariant(
          relationMap.get(view)?.relation_kind === "v",
          `required view ${view} is absent`,
        );
      }
      invariant(
        [...BASE_TABLES, ...VIEWS].every(
          (name) =>
            !APPLICATION_ROLE_SET.has(relationMap.get(name)?.owner_name ?? ""),
        ),
        "an application role owns a database relation",
      );
      checks.push("critical-relations");

      const triggerRows = await transaction<
        {
          table_name: string;
          trigger_name: string;
          enabled: string;
          definition: string;
        }[]
      >`
        SELECT relation.relname AS table_name, trigger.tgname AS trigger_name,
               trigger.tgenabled AS enabled,
               pg_get_triggerdef(trigger.oid) AS definition
        FROM pg_trigger trigger
        JOIN pg_class relation ON relation.oid = trigger.tgrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal
      `;
      const triggers = new Map(
        triggerRows.map((trigger) => [
          `${trigger.table_name}:${trigger.trigger_name}`,
          trigger,
        ]),
      );
      for (const table of IMMUTABLE_TABLES) {
        const trigger = triggers.get(`${table}:${table}_immutable`);
        invariant(
          trigger?.enabled === "O",
          `immutable trigger missing on ${table}`,
        );
        invariant(
          trigger.definition.includes("BEFORE") &&
            trigger.definition.includes("UPDATE") &&
            trigger.definition.includes("DELETE") &&
            trigger.definition.includes("TRUNCATE") &&
            trigger.definition.includes("FOR EACH STATEMENT"),
          `immutable trigger on ${table} has an unexpected definition`,
        );
      }
      for (const [table, triggerName] of LIFECYCLE_TRIGGERS) {
        invariant(
          triggers.get(`${table}:${triggerName}`)?.enabled === "O",
          `lifecycle trigger ${triggerName} is absent or disabled`,
        );
      }
      checks.push("immutable-and-lifecycle-triggers");

      const roleRows = await transaction<
        {
          rolname: string;
          rolcanlogin: boolean;
          rolsuper: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolinherit: boolean;
          schema_usage: boolean;
          schema_create: boolean;
        }[]
      >`
        SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
               rolinherit,
               has_schema_privilege(rolname, 'public', 'USAGE') AS schema_usage,
               has_schema_privilege(rolname, 'public', 'CREATE') AS schema_create
        FROM pg_roles
        WHERE rolname LIKE 'jev_%'
      `;
      const roles = new Map(roleRows.map((role) => [role.rolname, role]));
      for (const roleName of APPLICATION_ROLES) {
        const role = roles.get(roleName);
        invariant(role, `required role ${roleName} is absent`);
        invariant(
          !role.rolcanlogin &&
            !role.rolsuper &&
            !role.rolcreatedb &&
            !role.rolcreaterole &&
            !role.rolinherit &&
            role.schema_usage &&
            !role.schema_create,
          `role ${roleName} has unsafe attributes or schema privileges`,
        );
      }

      const unsafePublicSchemaGrants = await transaction<
        { present: boolean }[]
      >`
        SELECT EXISTS (
          SELECT 1
          FROM pg_namespace namespace
          CROSS JOIN LATERAL aclexplode(
            COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
          ) privilege
          WHERE namespace.nspname = 'public'
            AND privilege.grantee = 0
            AND privilege.privilege_type = 'CREATE'
        ) AS present
      `;
      invariant(
        unsafePublicSchemaGrants[0]?.present === false,
        "PUBLIC can create objects in the public schema",
      );

      const unsafeRoleMemberships = await transaction<
        { member_name: string; inherited_role_name: string }[]
      >`
        SELECT member.rolname AS member_name,
               inherited_role.rolname AS inherited_role_name
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles inherited_role ON inherited_role.oid = membership.roleid
        WHERE member.rolname IN (
          'jev_public_reader', 'jev_public_ingest', 'jev_worker', 'jev_operator'
        )
      `;
      invariant(
        unsafeRoleMemberships.length === 0,
        "an application role can assume another database role",
      );

      const directRelationGrants = await transaction<
        { grantee: string; relation_name: string; privilege_type: string }[]
      >`
        SELECT grantee.rolname AS grantee,
               relation.relname AS relation_name,
               privilege.privilege_type
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(
          COALESCE(relation.relacl, acldefault('r', relation.relowner))
        ) privilege
        LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (
            privilege.grantee = 0
            OR grantee.rolname IN (
              'jev_public_reader', 'jev_public_ingest', 'jev_worker', 'jev_operator'
            )
          )
      `;
      invariant(
        directRelationGrants.every(isAllowedDirectRelationGrant),
        "PUBLIC or application roles have unexpected direct relation privileges",
      );
      invariant(
        directRelationGrants.some(isAllowedDirectRelationGrant),
        "public reader lacks the redacted Evidence Lab projection view",
      );

      const directColumnGrants = await transaction<
        {
          grantee: string;
          relation_name: string;
          column_name: string;
          privilege_type: string;
        }[]
      >`
        SELECT COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
               relation.relname AS relation_name,
               attribute.attname AS column_name,
               privilege.privilege_type
        FROM pg_attribute attribute
        JOIN pg_class relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
        LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND (
            privilege.grantee = 0
            OR grantee.rolname IN (
              'jev_public_reader', 'jev_public_ingest', 'jev_worker', 'jev_operator'
            )
          )
      `;
      invariant(
        directColumnGrants.length === 0,
        "PUBLIC or application roles have direct column privileges",
      );
      checks.push("role-boundaries");

      const functionRows = await transaction<
        {
          function_oid: string;
          function_name: string;
          security_definer: boolean;
          configuration: string[] | null;
          owner_name: string;
        }[]
      >`
        SELECT function.oid::text AS function_oid,
               function.proname AS function_name,
               function.prosecdef AS security_definer,
               function.proconfig AS configuration,
               owner.rolname AS owner_name
        FROM pg_proc function
        JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
        JOIN pg_roles owner ON owner.oid = function.proowner
        WHERE namespace.nspname = 'public'
      `;
      const functions = new Map(
        functionRows.map((databaseFunction) => [
          databaseFunction.function_name,
          databaseFunction,
        ]),
      );
      for (const functionName of PROJECT_FUNCTIONS) {
        const databaseFunction = functions.get(functionName);
        invariant(
          databaseFunction,
          `required function ${functionName} is absent`,
        );
        invariant(
          !APPLICATION_ROLE_SET.has(databaseFunction.owner_name),
          `application role owns function ${functionName}`,
        );
      }
      for (const functionName of SECURITY_DEFINER_FUNCTIONS) {
        const databaseFunction = functions.get(functionName);
        invariant(
          databaseFunction,
          `required function ${functionName} is absent`,
        );
        invariant(
          databaseFunction.security_definer &&
            databaseFunction.configuration?.includes(
              "search_path=pg_catalog, public, pg_temp",
            ),
          `function ${functionName} lacks its secure execution boundary`,
        );
      }

      const applicationFunctionGrants = await transaction<
        { function_name: string; grantee: string }[]
      >`
        SELECT function.proname AS function_name,
               COALESCE(grantee.rolname, 'PUBLIC') AS grantee
        FROM pg_proc function
        JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
        CROSS JOIN LATERAL aclexplode(
          COALESCE(function.proacl, acldefault('f', function.proowner))
        ) privilege
        LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
        WHERE namespace.nspname = 'public'
          AND privilege.privilege_type = 'EXECUTE'
          AND (
            privilege.grantee = 0
            OR grantee.rolname IN (
              'jev_public_reader', 'jev_public_ingest', 'jev_worker', 'jev_operator'
            )
          )
      `;
      const actualGrants = new Map<string, Set<string>>();
      for (const grant of applicationFunctionGrants) {
        if (!PROJECT_FUNCTIONS.has(grant.function_name)) continue;
        const grantees =
          actualGrants.get(grant.function_name) ?? new Set<string>();
        grantees.add(grant.grantee);
        actualGrants.set(grant.function_name, grantees);
      }
      for (const [functionName, expectedRoles] of FUNCTION_GRANTS) {
        assertSameMembers(
          actualGrants.get(functionName) ?? [],
          expectedRoles,
          `function ${functionName} has an unexpected execute grant`,
        );
      }
      for (const [functionName, grantees] of actualGrants) {
        invariant(
          FUNCTION_GRANTS.has(functionName) && !grantees.has("PUBLIC"),
          `function ${functionName} is executable by an unexpected role`,
        );
      }
      checks.push("function-grants");

      const indexRows = await transaction<
        { index_name: string; is_valid: boolean; is_ready: boolean }[]
      >`
        SELECT index_relation.relname AS index_name,
               index.indisvalid AS is_valid,
               index.indisready AS is_ready
        FROM pg_index index
        JOIN pg_class index_relation ON index_relation.oid = index.indexrelid
        JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
        WHERE namespace.nspname = 'public'
      `;
      const indexes = new Map(
        indexRows.map((index) => [index.index_name, index]),
      );
      for (const indexName of CRITICAL_INDEXES) {
        const index = indexes.get(indexName);
        invariant(
          index?.is_valid && index.is_ready,
          `critical index ${indexName} is absent or invalid`,
        );
      }

      const invalidConstraints = await transaction<
        { constraint_name: string }[]
      >`
        SELECT database_constraint.conname AS constraint_name
        FROM pg_constraint database_constraint
        JOIN pg_namespace namespace
          ON namespace.oid = database_constraint.connamespace
        WHERE namespace.nspname = 'public'
          AND NOT database_constraint.convalidated
      `;
      invariant(
        invalidConstraints.length === 0,
        "public schema contains unvalidated constraints",
      );
      checks.push("indexes-and-constraints");
    });

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        schemaVersions: appliedSchemaVersions,
        checks,
      })}\n`,
    );
  } catch (error: unknown) {
    throw new Error(redactDatabaseError(error, databaseUrl));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  verifyDatabase().catch((error: unknown) => {
    process.stderr.write(`${redactDatabaseError(error)}\n`);
    process.exitCode = 1;
  });
}
