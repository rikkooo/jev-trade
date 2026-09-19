# Fixture release receipt

Copy this file for each public fixture release. Keep secrets and full environment
output out of the receipt.

## Identity

- Operation ID:
- UTC start/end:
- Operator:
- Reviewer:
- Git commit:
- Branch:
- Immutable preview URL:
- Immutable production URL:
- Previous validated production URL:

## Build evidence

- [ ] Clean checkout installed with Node 22 and the pinned pnpm version.
- [ ] Format, lint, typecheck, unit, integration, and browser tests passed.
- [ ] Production build passed.
- [ ] `pnpm audit --prod` reported no blocking advisory.
- [ ] Compose validation and the read-only, non-root container build passed.
- [ ] Container scanner result or an explicit scanner-unavailable disposition is attached.

## Runtime evidence

- [ ] `pnpm verify:deployment -- <preview-url>` passed.
- [ ] `pnpm verify:deployment -- <production-url>` passed.
- [ ] Health reported `fixture`, `durableWrites=false`,
      `publicMarketData=false`, and `liveJudgments=false`.
- [ ] No live provider, database, Cron, or operator credential was present.
- [ ] The initial stock response did not disclose the blind Jev call.
- [ ] Desktop, tablet, and 400-pixel browser journeys passed.
- [ ] Security headers, robots metadata, sitemap, and fixture disclosures were checked.

## Rollback evidence

- [ ] The previous validated deployment remains addressable.
- [ ] The rollback command or dashboard action was rehearsed without moving the
      production alias, or an actual rollback and re-promotion was recorded.
- [ ] Health and critical journeys passed on the rollback target.
- [ ] Fixture deployment has no scheduled Cron jobs to reconcile.

## Decision

- Result: `PASS` / `FAIL`
- Failed or deferred checks:
- Deployment promoted by:
- UTC promotion time:
