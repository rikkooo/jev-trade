# Fixture deployment runbook

Fixture mode is the first public deployment. It uses committed synthetic market
fixtures and frozen Jev responses. It must not need OpenRouter, market-data, or
database credentials, and it must fail closed for server-side mutations.

## Preconditions

- Work from a clean, reviewed commit on the intended branch.
- Use Node.js 22 and the pnpm version pinned in `package.json`.
- Do not place credentials in `.env.local`; fixture mode does not require them.
- Confirm the UI says `fixture demonstration` and does not say live,
  prospective, verified, or market-current.
- Confirm `vercel.json` contains no Cron schedule. Fixture deployment has no
  durable backend and must not create a recurring failed invocation.
- Create an operation ID and an empty receipt using the standard in
  [README](README.md#receipt-standard).

Record, but do not publish, the output of:

```bash
git status --short
git rev-parse HEAD
node --version
corepack pnpm --version
```

The status must contain no unexpected changes. The major Node version must be
22.

## Build and test on the HQ box

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
docker compose -f deploy/compose.yaml config --quiet
docker build --pull -f deploy/Dockerfile -t jev-trade-fixture:"$(git rev-parse --short HEAD)" .
```

If a required gate fails, stop. Do not deploy by omitting the failing gate. A
registry or package audit warning needs a recorded disposition; a vulnerable
runtime dependency blocks promotion until fixed or explicitly accepted by the
project owner with scope and expiry.

## Local Docker validation

Use a temporary, owner-readable environment file. The Compose stack currently
starts a local Postgres container, but the application must report that database
authority and durable writes are disabled in fixture mode.

```bash
umask 077
fixture_env="${XDG_RUNTIME_DIR:-/tmp}/jev-trade-fixture.env"
local_pg_password="$(openssl rand -hex 24)"
cat >"$fixture_env" <<EOF
APP_MODE=fixture
APP_ORIGIN=http://127.0.0.1:3000
PUBLIC_MARKET_DATA=false
DURABLE_WRITES=false
POSTGRES_DB=jev_trade
POSTGRES_USER=jev_migrator
POSTGRES_PASSWORD=$local_pg_password
EOF
chmod 600 "$fixture_env"
unset local_pg_password

docker compose --env-file "$fixture_env" -f deploy/compose.yaml up -d --build
docker compose --env-file "$fixture_env" -f deploy/compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1:3000/health/live
curl --fail --silent --show-error http://127.0.0.1:3000/api/health | jq .
```

Expected `/api/health` capability values:

```json
{
  "mode": "fixture",
  "capabilities": {
    "durableWrites": false,
    "publicMarketData": false,
    "liveJudgments": false
  }
}
```

`capabilities.database` can be `false` or `true` depending on whether the URL is
passed, but it does not authorize writes. Exercise the desktop and 400-pixel
browser journeys, reload the app, and verify any visitor pick is labeled as saved
only in that browser.

Inspect logs for errors and redaction without copying the full log into a
receipt:

```bash
docker compose --env-file "$fixture_env" -f deploy/compose.yaml logs --since=10m web
```

Stop without deleting the database volume:

```bash
docker compose --env-file "$fixture_env" -f deploy/compose.yaml down
rm -f "$fixture_env"
unset fixture_env
```

Do not add `--volumes` to the shutdown command unless the volume is a confirmed
disposable test volume and its deletion has been separately authorized.

## Vercel preview

Use an authenticated Vercel session or a CI identity. Never pass a token through
`--token <value>` because process listings and shell history may expose it.

```bash
vercel whoami
vercel link --yes --project jev-trade
vercel env ls preview
vercel deploy
```

If the project is already linked, verify `.vercel/project.json` names the
expected project without printing credentials. Preview must not inherit
production database or provider credentials.

Set only these non-secret fixture values for Preview and Production, using the
Vercel dashboard or `vercel env add`:

| Variable | Value |
|---|---|
| `APP_MODE` | `fixture` |
| `PUBLIC_MARKET_DATA` | `false` |
| `DURABLE_WRITES` | `false` |
| `APP_ORIGIN` | exact HTTPS deployment/canonical origin for that environment |

Remove `OPENROUTER_API_KEY`, `MARKET_DATA_API_KEY`, `DATABASE_URL`,
`DATABASE_MIGRATION_URL`, `CRON_SECRET`, and `OPERATOR_TOKEN` from a fixture-only
environment. Merely leaving a feature flag false is weaker than removing an
unneeded credential.

Store the preview URL in a shell variable and verify it:

```bash
preview_url='https://<PREVIEW-DEPLOYMENT-HOST>'
curl --fail --silent --show-error "$preview_url/health/live"
curl --fail --silent --show-error "$preview_url/api/health" | jq .
curl --fail --silent --show-error --head "$preview_url/" | sed -n '1,30p'
```

Expected results:

- health is `ok`, mode is `fixture`, and all three mutable/live capability flags
  are false;
- security headers are present;
- no page or public response contains a secret-shaped value, provider payload,
  or real market field;
- mutation and Cron routes are absent or return a safe no-op/fail-closed status;
- responsive, keyboard, error, and local-pick flows work.

Run the automated form of these checks as well:

```bash
pnpm verify:deployment -- "$preview_url"
```

## Vercel production fixture deployment

Deploy production only after the preview receipt is reviewed:

```bash
vercel deploy --prod
```

Capture the immutable production deployment URL. Verify that URL before any
domain is assigned or promoted:

```bash
production_url='https://<IMMUTABLE-PRODUCTION-DEPLOYMENT-HOST>'
curl --fail --silent --show-error "$production_url/health/live"
curl --fail --silent --show-error "$production_url/api/health" | jq .
curl --fail --silent --show-error --head "$production_url/" | sed -n '1,30p'
pnpm verify:deployment -- "$production_url"
```

If the custom domain already points to this project, repeat the same checks
against the canonical domain and confirm the certificate and redirect. Domain
ownership and DNS changes remain with the project owner.

## Fixture deployment receipt

- [ ] Commit SHA and immutable Vercel deployment URL recorded.
- [ ] Install, format, lint, typecheck, tests, build, audit, Compose config, and
      image build recorded as pass.
- [ ] `/health/live` and `/api/health` verified locally, on Preview, and on the
      immutable Production URL.
- [ ] `mode=fixture`, `durableWrites=false`, `publicMarketData=false`, and
      `liveJudgments=false` observed.
- [ ] Public pages show synthetic/fixture and browser-local disclosures.
- [ ] No external key was needed or available to the fixture runtime.
- [ ] Mutation/Cron behavior failed closed.
- [ ] Desktop, keyboard, and 400-pixel journeys checked.
- [ ] Security headers and canonical redirect checked.
- [ ] Previous validated deployment URL recorded as rollback target.
- [ ] Reviewer and UTC review time recorded.

Unchecked items block the deployment receipt from being called complete.

## Enabling Cron later

The fixture `vercel.json` intentionally schedules no jobs. A durable release may
add a production Cron entry for `GET /api/internal/cron` only after all of these
are true:

- `APP_MODE=live` and `DURABLE_WRITES=true` pass configuration validation;
- the database-backed queue adapter has replaced the fixture route executor;
- `CRON_SECRET` is a Vercel Production secret and is at least 32 characters;
- provider rights, root attestation, budgets, alerting, and rollback gates are
  recorded;
- an authenticated manual invocation proves idempotency and safe retry.

Vercel sends Cron requests as `GET`, adds `Authorization: Bearer <CRON_SECRET>`
when that project secret exists, and identifies the scheduler with
`vercel-cron/1.0`. The route requires all three properties and derives its own
time-bucket idempotency key.
