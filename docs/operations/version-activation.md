# Model, question, and policy version activation

Version changes create a new prospective cohort. They never rewrite, relabel, or
re-score an existing forecast under a new contract.

## Independently versioned contracts

- Jev provider transport and requested model ID;
- actual returned model/build ID;
- canonical compact-state schema;
- four-question wording, criteria, option names, and response validation;
- market-risk formula and input definitions;
- policy gates, thresholds, sizing, stops, execution assumptions, and budgets;
- direction outcome bands and scoring rules;
- market provider/normalization contract and corporate-action treatment;
- disclosure/methodology text tied to those behaviors.

A wording-only question change is a new question-set version. A threshold-only
change is a new policy version. A provider silently returning a different model
build is model drift and blocks scored publication until reviewed.

## Version lifecycle

Use append-only states:

```text
DRAFT -> VALIDATED -> APPROVED -> ACTIVE -> RETIRED
```

An activation event contains the immutable version IDs, artifact hashes,
approver, UTC effective cutoff/session, activation reason, source commit SHA, and
validation receipt. Only one complete version tuple is active for a given mode,
horizon, and cutoff. Retirement is prospective and does not change old rows.

## Validation gates

1. Canonical request/response fixtures and strict contract tests pass.
2. Market features, risk, policy, outcome, and score golden vectors pass.
3. No-future-data and same-bar-fill invariants pass.
4. Old and new version tuples replay independently without changing old output.
5. One credentialed, non-scored OpenRouter smoke test returns the expected typed
   schema and exact approved model/build; key and state payload are not logged.
6. A non-scored repeatability cohort runs 20 representative frozen snapshots ten
   times each with fixed model/question versions.
7. Each snapshot reaches at least 90% policy-action agreement. Report all misses,
   distribution drift, entropy/concentration, cost, and latency.
8. UI/methodology labels, filters, risk explanations, and sample warnings render
   the new versions accurately.
9. Budget and provider limits cover the proposed cohort.
10. An independent reviewer signs the activation receipt.

If any snapshot misses the agreement gate, publish the measured validation
result internally, revise under another draft version, and rerun. Do not hide
unstable snapshots or open the scored track anyway.

## Activation procedure

1. Choose a future eligible market cutoff after all validation completes. Do not
   activate inside an already-started publication batch.
2. Freeze and hash every artifact in the tuple. Record exact requested and
   returned model IDs.
3. Complete the validation receipt and approval.
4. Append one activation event through a narrow operator procedure using an
   idempotency key.
5. Read back the active tuple from the public methodology projection and operator
   status. It must still show the prior tuple before the cutoff and the new tuple
   at/after it.
6. Run one non-scored canary at the boundary; verify version IDs, state hash,
   policy trace, budget, and response schema.
7. Permit scored jobs only after the canary passes. Every forecast stores the
   complete tuple; never infer versions from current configuration later.
8. Verify scorecard filters keep incompatible cohorts separate or label a mixed
   view explicitly.

The repository does not yet expose an audited activation CLI. Direct Production
SQL is prohibited. Activation is blocked until implementation provides commands
with this contract:

```bash
# FUTURE COMMAND CONTRACT — not currently executable
pnpm ops:version-status -- --environment production
pnpm ops:version-validate -- --manifest '<VERSION-MANIFEST-PATH>'
pnpm ops:version-activate -- \
  --manifest '<VERSION-MANIFEST-PATH>' \
  --effective-cutoff '<ISO-8601-UTC>' \
  --idempotency-key '<UNIQUE-OPERATION-ID>'
```

The CLI must print IDs, hashes, statuses, and UTC times only. It must not print
credentials, canonical market state, licensed inputs, or full provider payloads.
It must require an operator credential, use the versioned database procedure,
and return the same activation ID when the idempotency key repeats.

## Failed activation or rollback

- Before the effective cutoff, append a cancellation event if no scored job used
  the tuple.
- After the cutoff, retire the faulty tuple prospectively. Preserve affected
  forecasts and append failure/correction status as required.
- To return to a prior known-good tuple, append a new activation event with a new
  future cutoff. Do not move the old activation timestamp or reassign records.
- A returned model mismatch stops new judgments immediately. It is never
  accepted merely because the alias stayed the same.
- No active position's deterministic terms change when a policy version changes;
  it continues under its frozen version unless the original policy explicitly
  defines a versioned safety transition.

## Activation receipt

- [ ] All version IDs, artifact hashes, requested/returned model IDs, commit SHA,
      mode/horizon, and future effective cutoff recorded.
- [ ] Contract, feature, policy, leakage, replay, and UI tests passed.
- [ ] Non-scored live smoke recorded without key or payload.
- [ ] 20-by-10 repeatability cohort and per-snapshot ≥90% action agreement
      recorded.
- [ ] Cost/budget and exact model-build check passed.
- [ ] Prior tuple remains reproducible and scorecard cohorts remain separate.
- [ ] Activation/cancellation/retirement event ID and idempotency key recorded.
- [ ] Boundary canary and public methodology labels verified.
- [ ] Independent approver and UTC approval time recorded.

