#!/usr/bin/env bash
# Rehearses the #15 upgrade from a populated v0.1 database and the
# forward-only rollback policy. It writes and drops schema objects, so it
# refuses to run unless the target database is empty. Disposable use only.
#
#   DATABASE_MIGRATION_URL  migration-owner URL of an empty disposable database
#   PSQL_COMMAND            optional psql invocation for that database
#                           (default: psql "$DATABASE_MIGRATION_URL")
#   V01_RELEASE             v0.1 release commit (default: the frozen c75b9aa)
set -euo pipefail

: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL is required}"
V01_RELEASE="${V01_RELEASE:-c75b9aa26f8f13c337bfbdef4b3fba9c0922a4b9}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

psql_run() {
  if [ -n "${PSQL_COMMAND:-}" ]; then
    # shellcheck disable=SC2086
    $PSQL_COMMAND -v ON_ERROR_STOP=1 -q -At "$@"
  else
    psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -q -At "$@"
  fi
}
step() { printf '\n== %s\n' "$*"; }
fail() { printf 'REHEARSAL FAILED: %s\n' "$*" >&2; exit 1; }

v01_dir="$(mktemp -d)"
trap 'rm -rf "$v01_dir"' EXIT
mkdir -p "$v01_dir/scripts"
git show "$V01_RELEASE:scripts/migrate.ts" >"$v01_dir/scripts/migrate.ts"
git show "$V01_RELEASE:scripts/verify-database.ts" >"$v01_dir/scripts/verify-database.ts"
ln -s "$root/db" "$v01_dir/db"
ln -s "$root/node_modules" "$v01_dir/node_modules"
v01_verify() { "$root/node_modules/.bin/tsx" "$v01_dir/scripts/verify-database.ts"; }
digest() { psql_run <tests/db/v01-ledger-digest.sql; }
applied_only_0002() {
  node -e '
    const run = JSON.parse(process.argv[1]);
    if (JSON.stringify(run.applied) !== JSON.stringify(["0002_evidence_lab_registry"])) process.exit(1);
  ' "$1"
}

[ "$(psql_run -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")" = "0" ] ||
  fail "target database is not empty"

step "1. Released v0.1 shape, populated by the v0.1 ledger suite"
pnpm --silent db:migrate -- --through 0001_immutable_ledger
psql_run <tests/db/ledger-foundation.sql >/dev/null
v01_before="$(digest)"
v01_verify

step "2. Upgrade applies only 0002 and leaves every v0.1 row and projection unchanged"
run="$(pnpm --silent db:migrate)"
echo "$run"
applied_only_0002 "$run" || fail "upgrade did not apply exactly 0002"
[ "$(digest)" = "$v01_before" ] || fail "v0.1 rows changed during upgrade"
pnpm --silent db:verify

step "3. The v0.1 verifier from the release commit accepts the expanded schema"
v01_verify

step "4. Schema rollback is permitted while no evidence exists"
psql_run <db/migrations/0002_evidence_lab_registry.down.sql
v01_verify
[ "$(digest)" = "$v01_before" ] || fail "v0.1 rows changed during rollback"
run="$(pnpm --silent db:migrate)"
applied_only_0002 "$run" || fail "re-upgrade did not apply exactly 0002"
pnpm --silent db:verify

step "5. Evidence is written through the role procedures"
psql_run <tests/db/evidence-lab-foundation.sql
EVIDENCE_LAB_DATABASE_URL="$DATABASE_MIGRATION_URL" EVIDENCE_LAB_REQUIRE_DATABASE=true \
  pnpm exec vitest run --config vitest.integration.config.ts tests/integration/evidence-lab-database.test.ts
pnpm --silent db:verify

step "6. After evidence writes, rollback is refused and recovery is forward-only"
if psql_run <db/migrations/0002_evidence_lab_registry.down.sql 2>"$v01_dir/down.err"; then
  fail "rollback dropped a schema that holds evidence"
fi
grep -Fq "recovery is forward-only" "$v01_dir/down.err" || fail "rollback failed for the wrong reason"
pnpm --silent db:verify
[ "$(digest)" = "$v01_before" ] || fail "v0.1 rows changed after evidence writes"
v01_verify

printf '\nREHEARSAL PASSED\n'
