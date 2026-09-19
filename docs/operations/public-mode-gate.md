# Market-data rights and public-mode release gate

`PUBLIC_MARKET_DATA=true` is a release result, not permission. Public live mode
requires written rights, an active append-only rights record, a durable database,
and the technical/review evidence below. When any condition is absent or
uncertain, remain in fixture mode or a contract-compliant restricted live mode.

## Release stages

| Stage | Audience | Market data | Evidence claim |
|---|---|---|---|
| Fixture | Public allowed | Synthetic/explicitly redistributable fixtures only | Demonstration only |
| Restricted live | Contract-authorized testers only | Development/internal fields under written terms | Private validation, never later relabeled public prospective |
| Public live | Public | Only fields/uses in active rights record | Prospective simulation after gate time |
| Promotion | Public plus YouTube/social | Same active rights including media use | Only after 30-day/review gate |

## Required provider-rights record

The record and attached contract/order evidence must name:

- legal provider and exact product/plan/order form;
- effective date, expiry/renewal date, territory, audience, and permitted domains;
- permitted symbols/venues and real-time, delayed, or EOD timing;
- exact raw fields displayed and exact fields stored;
- history depth, caching duration, retention after termination, and backup rules;
- permission for public charts, quotes, tables, and API responses;
- permission for derived indicators, risk measures, rankings, signals, forecasts,
  outcomes, and aggregate scorecards;
- permission for screenshots, share cards, recorded demos, YouTube, and other
  promotion;
- correction/corporate-action data and point-in-time availability terms;
- whether source data/derived descriptors may be sent to Jev/OpenRouter;
- required attribution, disclaimers, delay labels, and logo/link rules;
- user export, redistribution, sublicensing, and automated-access restrictions;
- rate limits, budget, outage/support terms, cancellation/export, and deletion;
- provider contact, internal owner, legal/compliance reviewer, and evidence hash.

An active Jev-processor record separately covers OpenRouter/TypeSafe retention,
training, residency, subprocessors, security, and deletion. The scored state sends
only approved derived descriptors, structured facts, source IDs, and content
hashes—never raw licensed articles, snippets, markup, or provider-native
payloads.

## Technical gates for public live mode

- [ ] Exact provider-rights and Jev-processor records are active for the release
      time and intended use.
- [ ] Public field/view allowlist has been compared line by line with the rights
      record.
- [ ] Neon Production and Preview are isolated; migrations and restricted roles
      are verified.
- [ ] Immutable triggers, idempotent procedures, correction chains, replay, and
      future-data tests pass.
- [ ] Encrypted off-host backup exists and a restore rehearsal passed.
- [ ] Current and prior application versions are compatible with the expanded
      schema; rollback rehearsal passed.
- [ ] Production OpenRouter and market-data keys are restricted, rotated from any
      development exposure, and have spend/rate alerts.
- [ ] Cron authentication, duplicate/overlap behavior, reconciliation, and stale
      states pass.
- [ ] External root attestation and pre-session deadline behavior pass.
- [ ] WAF/application rate limits protect public writes and paid upstream routes.
- [ ] Security headers, HTTPS, canonical host, source/build-log protection, and
      secret redaction pass.
- [ ] Simulation, methodology, provider attribution, data delay/freshness,
      privacy consent/retention, correction, and low-sample disclosures are live.
- [ ] Independent review found no future leakage, mutable forecast, unlicensed
      field, operator route, or performance overclaim.

## Activation order

1. Keep Production at `PUBLIC_MARKET_DATA=false` and `DURABLE_WRITES=false` while
   provisioning and validating on isolated branches.
2. Append the reviewed provider-rights and Jev-processor records. Do not store the
   full contract in a public table; store its controlled reference and evidence
   hash.
3. Apply migrations explicitly and verify restricted runtime roles.
4. Run a contract-compliant restricted live soak with no public alias or public
   cache. Private results remain labeled private/non-public.
5. Complete backup/restore, rollback, budget, Cron, attestation, security,
   disclosure, and independent-review receipts.
6. Stage the exact Production build while public data remains false. Verify it on
   its immutable URL.
7. Append a public-gate activation event through the narrow operator procedure,
   with a future UTC cutoff and all evidence IDs.
8. Set the final Production configuration as sensitive/environment values and
   deploy a new immutable build:

   ```text
   APP_MODE=live
   DURABLE_WRITES=true
   PUBLIC_MARKET_DATA=true
   ```

9. Verify `/api/health` capabilities, public field allowlist, attribution,
   freshness, immutable forecast detail, mutation authorization, and canonical
   domain. The health endpoint must expose flags, never values.
10. Start the prospective scorecard at zero at the recorded gate/cohort boundary,
    or label every earlier private/fixture/retrospective record separately.

The repository does not yet contain an audited public-gate CLI or complete
rights schema. Direct Production SQL is prohibited. The implementation must
provide an idempotent operator contract before live activation:

```bash
# FUTURE COMMAND CONTRACT — not currently executable
pnpm ops:public-gate-status -- --environment production
pnpm ops:public-gate-validate -- --rights-record '<RIGHTS-RECORD-ID>'
pnpm ops:public-gate-activate -- \
  --rights-record '<RIGHTS-RECORD-ID>' \
  --processor-record '<PROCESSOR-RECORD-ID>' \
  --effective-cutoff '<ISO-8601-UTC>' \
  --idempotency-key '<UNIQUE-OPERATION-ID>'
```

Environment flags alone must not bypass a missing/expired database gate.

## Verification after activation

```bash
origin='https://<IMMUTABLE-PRODUCTION-DEPLOYMENT-HOST>'
curl --fail --silent --show-error "$origin/health/live"
curl --fail --silent --show-error "$origin/api/health" | jq .
curl --fail --silent --show-error --head "$origin/" | sed -n '1,30p'
pnpm verify:forecast -- --id <FIRST-PUBLIC-FORECAST-ULID>
```

Verify through the browser and public API that only allowed fields appear and
that the first public forecast's cutoff, latest included session, model/question/
policy versions, source hashes, action, root, and timely external receipt are
reconstructable. Confirm the forecast never fills on an input bar and has no
paper entry without a timely receipt.

## Rights expiry, revocation, or uncertainty

1. Stop new ingestion/publication immediately.
2. Promote the last validated fixture deployment or deploy with
   `PUBLIC_MARKET_DATA=false` and `DURABLE_WRITES=false` after verifying the safe
   behavior.
3. Revoke/disable the production provider key if the contract or credential is
   compromised.
4. Append a rights suspension/expiry event with UTC effective time and evidence
   reference.
5. Remove or suppress cached/raw public fields as the contract requires while
   preserving only evidence the retention clause permits.
6. Keep immutable forecasts/derived outputs visible only when the contract
   explicitly permits post-termination retention/display; otherwise serve a
   redacted audit reference and retain controlled evidence per counsel/provider.
7. Purge CDN/application caches for fields whose continued display is forbidden.
8. Resume through the full gate with a new rights revision; never edit the prior
   record's dates.

## Promotion and communications gate

Public operation may begin before marketing, but YouTube/social promotion waits
for:

- a 30-day soak with at least 98% eligible scheduled evaluations completed;
- at least 98% publication roots attested before deadline and no duplicate
  publications;
- prospective sample/coverage and low-sample warnings verified;
- moderated comprehension evidence showing at least four of five participants
  distinguish Jev judgment, market-risk index, and planned position loss;
- calibration/Brier/baseline/P&L/drawdown claims reproduced and independently
  reviewed;
- active rights explicitly covering screenshots, recordings, share cards, and
  promotional use;
- project-owner and legal/compliance review of simulation/methodology language.

Communications must show sample size and the live ledger, say results are
simulated, avoid cherry-picked winners and return promises, and link the active
methodology and resolved scorecard.

## Public-mode receipt

- [ ] Rights and processor record IDs, hashes, dates, owners, and reviewers
      recorded.
- [ ] Exact public field/use/retention/media allowlist reviewed against contract.
- [ ] Database, roles, immutable ledger, backup/restore, and rollback evidence
      recorded.
- [ ] Credential scope, spend cap, rate limit, and redaction evidence recorded.
- [ ] Cron/reconciliation and external attestation checks passed.
- [ ] Disclosures, attribution, freshness, privacy, and sample warnings verified.
- [ ] Public-gate event, effective cutoff, commit/deployment SHA, and capability
      flags recorded.
- [ ] First public forecast reconstructed from source hashes through receipt.
- [ ] Fixture/private history remains separated from the public prospective
      cohort.
- [ ] Independent reviewer and explicit promotion status recorded.

