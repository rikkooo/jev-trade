# Production secrets runbook

Credentials are server-side capabilities, not configuration conveniences. Give
each environment and workload the narrowest distinct credential practical.
Never use a `NEXT_PUBLIC_` prefix for a credential.

## Inventory

| Secret | Consumer | Minimum scope | Primary store | Immediate revoke point |
|---|---|---|---|---|
| Vercel operator/CI credential | Human or CI only | One team/project; deploy and env actions needed by that identity | Operator password manager or CI secret store; never application env | Vercel account/team token settings |
| `OPENROUTER_API_KEY` | Judgment Cron/function | Jev Decisions only where provider controls allow; strict spend limit | Vercel sensitive env, separate Preview/Production keys | OpenRouter key dashboard |
| `MARKET_DATA_API_KEY` | Market ingestion only | Contracted endpoints and environment | Vercel sensitive env after rights approval | Market-data provider console/support |
| `DATABASE_URL` | Runtime/worker | Pooled restricted runtime role; no schema ownership | Neon/Vercel sensitive env | Neon role/password or branch endpoint |
| `DATABASE_MIGRATION_URL` | One-shot migration job | Direct migration owner | Operator secret store or tightly scoped release environment; not steady-state function env | Neon migration role/password |
| `CRON_SECRET` | Vercel Cron and Cron handlers | Authenticate only scheduled routes; 32+ random bytes | Vercel sensitive Production env | Replace Vercel env and redeploy |
| `OPERATOR_TOKEN` | Local operator scripts if still required | Narrow correction/replay/version procedures | Operator password manager; short-lived preferred | Application/operator credential issuer |
| GitHub attestation publisher token | Isolated root publisher | Fine-grained `repository_dispatch` to one repository; no release or application-data access | Isolated publisher host/secret store | GitHub fine-grained token settings |
| Backup destination credential | Backup job only | Write new encrypted objects; read/delete only if retention needs it | Backup host secret store | Destination provider IAM |
| `age` decryption key | Restore operator only | Decrypt Jev Trade backups | Offline/off-host secret store; never Vercel or application host | Replace recipient for future backups; treat exposed archives separately |
| Neon owner/API credential | Provisioning/recovery operator | Project/branch administration | Operator password manager or provider integration | Neon account/integration settings |

Also inventory account recovery factors, service owners, expiry dates, creation
dates, last rotations, and provider spend/usage alerts. Do not record secret
values, URL query strings, or password-bearing connection strings in the
inventory.

## Add or replace a Vercel secret

The dashboard is preferred. To use the CLI without putting the value in shell
history or process arguments:

```bash
set +x
secret_name='<EXACT_VARIABLE_NAME>'
secret_environment='production' # or preview
read -r -s -p "Value for ${secret_name}: " secret_value
printf '\n' >&2
printf '%s' "$secret_value" | vercel env add "$secret_name" "$secret_environment" --sensitive
unset secret_value
```

Check current CLI help first because Vercel can change flags:

```bash
vercel env add --help
```

If the installed CLI does not accept stdin safely, stop and use the dashboard.
Never fall back to placing the value in a command argument. An environment
change affects only a later deployment, so create and verify a new deployment.

## Standard rotation

1. Open a receipt with the credential name, owner, reason, and environment. Do
   not record the old or new value.
2. Create a replacement credential with equal or narrower scope and a spend/rate
   cap where supported.
3. Install it in an isolated Preview or restricted environment and deploy.
4. Run the smallest non-destructive smoke test. For paid services, record request
   ID, safe status, latency, provider/model name, and cost, not request content.
5. Install it in Production, redeploy, and verify health plus one bounded
   workload.
6. Revoke the old credential at the provider. Do not leave an overlap window
   after the new credential is confirmed.
7. Search redacted logs and repository history for the credential name and known
   exposure path. Do not search by printing the secret.
8. Record provider-side revocation evidence, deployment ID, checks, and reviewer.

### OpenRouter

- Keep Production and non-production keys separate.
- Apply a hard account/key spend cap and an alert below the cap.
- Validate `typesafe/jev-1.13` only through the server-side Decisions endpoint.
- A rotated key never authorizes a model change. Verify that the returned model
  still matches the active model contract.
- Revoke the old key after a single non-scored smoke request succeeds.

### Market-data provider

- Confirm that replacement credentials remain under the same signed plan and
  rights record.
- Test only fields and environments the contract permits.
- Rotation does not cure expired display rights. If rights are uncertain or
  expired, keep `PUBLIC_MARKET_DATA=false`.

### Database credentials

- Create a new login or password for the same restricted group role.
- Deploy code with the new pooled runtime connection and verify read/append
  procedures.
- Revoke the old login only after no active deployment or scheduled invocation
  uses it.
- Rotate `DATABASE_MIGRATION_URL` separately. Never put a migration-owner URL in
  `DATABASE_URL`.
- Review Neon branches and Vercel Preview variables to ensure a Production URL
  was not copied into Preview.

### Cron secret

- Generate at least 32 random bytes in an approved secret manager or with a
  cryptographically secure local tool whose output is captured directly into a
  hidden variable.
- Replace `CRON_SECRET`, redeploy, and verify an unauthorized request is rejected
  before testing an authorized run.
- Vercel supplies the configured Cron bearer secret. Do not add it to URLs or
  application logs.

### GitHub attestation publisher

- Rotate on the isolated publisher host. Application containers must remain
  unable to read it.
- Scope the token to one repository and the single dispatch operation.
- Verify a fixture root dispatch and Sigstore/OIDC attestation chain before
  revoking the old token.

### Backup encryption and destination

- Add a new `age` recipient to future backup encryption, complete a restore test
  with its off-host private key, then retire the old recipient for new backups.
- Rotating an encryption key does not re-encrypt old archives. Retain the old
  private key for the required retention window or re-encrypt archives through a
  separately approved, audited operation.
- Rotate destination credentials without weakening object retention or deleting
  the independent copy.

## Suspected exposure or confirmed compromise

1. Declare an incident and preserve the suspected source without pasting it into
   a ticket.
2. Stop new paid calls/publication. For uncertainty, promote the last validated
   fixture deployment with all live capabilities false.
3. Revoke the exposed credential at its issuer first. Rotation without
   revocation is incomplete.
4. Replace it using the standard procedure and redeploy if the application needs
   that capability.
5. Review provider audit logs, spend, database sessions, Vercel deployments, and
   GitHub events for the exposure interval.
6. If data access may have occurred, preserve evidence and follow the applicable
   provider, privacy, and contractual notification process.
7. Search Git history with secret-scanning tooling that reports locations and
   fingerprints, not full values. Purging Git history is a separate destructive
   operation and does not replace revocation.
8. Record the containment and reviewer decision. Append any rights or ledger
   correction event required; never rewrite published evidence.

## Rotation receipt

- [ ] Credential name, environment, owner, reason, UTC times recorded.
- [ ] Replacement has equal or narrower scope and expected budget controls.
- [ ] Non-production/restricted smoke passed without logging a payload or value.
- [ ] Production deployment ID and bounded verification recorded.
- [ ] Old credential revoked at issuer.
- [ ] Audit/spend/access review recorded.
- [ ] Preview/Production isolation checked.
- [ ] No secret value appears in receipt, logs, Git, or command history.
- [ ] Reviewer recorded.

