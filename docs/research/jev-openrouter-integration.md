# Jev 1.13 through OpenRouter: integration contract

**Research date:** 2026-09-19  
**Decision owner:** Jev Trade  
**Status:** Recommended for the prototype; the authenticated live smoke test remains an implementation gate.

## Decision

Use OpenRouter as Jev Trade's first live Jev transport and call its dedicated Decisions endpoint directly:

```text
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
```

The request model should default to `typesafe/jev-1.13`. This is the versioned model ID in OpenRouter's official catalog. The response currently resolves it to the dated provider build `typesafe/jev-1.13-20260917`; persist that returned value with every judgment and refuse scored publication if it changes before a new model contract is approved.

Do not send Jev to `/api/v1/chat/completions`. Jev has the `text->decisions` modality, and OpenRouter exposes it through `/api/alpha/decisions`. The official OpenRouter TypeScript SDK represents the same route as `openRouter.alpha.decisions.create(...)`.

Keep an internal `JevProvider` boundary and implement OpenRouter as one adapter. Use a deterministic fixture adapter for tests and explicit demo mode. A Vercel AI Gateway adapter can be added later, but it is a separate transport and credential path; it is not a proxy for the supplied OpenRouter key.

This design preserves the product contract:

- Jev makes four narrow semantic judgments.
- Code computes indicators, dates, risk, sizing, actions, and outcomes.
- The complete returned distributions remain immutable evidence.
- A provider failure or model drift produces no new trade action.
- No Jev number is presented as a probability of profit.

## Verified sources

All links below were checked on 2026-09-19.

### Primary sources

- [OpenRouter Decisions API reference](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request) documents `POST /api/alpha/decisions`, bearer authentication, the request fields, typed response, and documented error statuses.
- [OpenRouter TypeScript SDK: Alpha.Decisions](https://openrouter.ai/docs/client-sdks/typescript/sdks/decisions/README) documents `openRouter.alpha.decisions.create(...)` and the `decisionsRequest` wrapper used by the SDK.
- [OpenRouter Jev 1.13 model page](https://openrouter.ai/typesafe/jev-1.13/) identifies `typesafe/jev-1.13`, the decisions modality, 32K context, and current public price.
- [OpenRouter Jev endpoint metadata](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints) identifies the TypeSafe provider endpoint and its current dated provider build.
- [TypeSafe HTTP API reference](https://docs.typesafe.ai/api) defines the System One request and answer schemas.
- [TypeSafe System One](https://docs.typesafe.ai/concepts/system-one) explains that Jev returns typed judgments and probabilities rather than generated text.
- [TypeSafe primitives](https://docs.typesafe.ai/primitives) defines Choice, Score, and Noul semantics and independent questions over one shared state.
- [TypeSafe confidence](https://docs.typesafe.ai/confidence) defines confidence as a statistic derived from distribution concentration and warns that thresholds must match the stakes.
- [TypeSafe models](https://docs.typesafe.ai/models) documents aliases, context limits, pricing, rate limits, and why a tested production contract should pin a version.
- [TypeSafe Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13) documents weak numeric/date behavior, literal reading, context distraction, adversarial state, and structural-invariance failures.
- [Vercel AI Gateway Jev page](https://vercel.com/ai-gateway/models/jev) documents Jev through `experimental_evaluate` with the Gateway model `typesafe-ai/jev`.
- [AI SDK evaluation API](https://ai-sdk.dev/docs/ai-sdk-core/evaluation) documents the experimental Choice, Score, and Boolean abstraction and Gateway string-model resolution.
- [Vercel AI Gateway authentication and BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok) documents `AI_GATEWAY_API_KEY`, Vercel OIDC, and provider credential handling.

### Licensed implementation reference

- [`rajivkuriakose/typesafe-jev-examples`](https://github.com/rajivkuriakose/typesafe-jev-examples) is MIT licensed and contains a live-tested OpenRouter transport, bounded retry examples, strict response parsing, and offline transport tests.
- [Reference client](https://github.com/rajivkuriakose/typesafe-jev-examples/blob/main/src/jevx/client.py) and [reference tests](https://github.com/rajivkuriakose/typesafe-jev-examples/blob/main/tests/test_client.py) were inspected for transport edge cases.

No source code from that repository is copied here. If implementation code is later ported rather than independently written, retain its MIT copyright and license notice.

## Exact OpenRouter wire contract

### Request envelope

OpenRouter requires:

```ts
type DecisionsRequest = {
  model: string;
  state: string | JsonObject | JsonValue[];
  questions: Record<string, NoulQuestion | ChoiceQuestion | ScoreQuestion>;
  provider?: Record<string, unknown> | null;
  session_id?: string; // max 256 characters; observability only
  trace?: Record<string, unknown>;
  user?: string; // max 256 characters
};
```

The Jev-native question types are:

```ts
type JsonGuidance = string | JsonObject | JsonValue[];

type NoulQuestion = {
  type: "noul";
  instructions: JsonGuidance;
  criteria?: {
    true: JsonGuidance;
    false: JsonGuidance;
  };
};

type ChoiceQuestion = {
  type: "choice";
  instructions: JsonGuidance;
  criteria: Record<string, JsonGuidance | null>;
};

type ScoreQuestion = {
  type: "score";
  instructions: JsonGuidance;
  criteria: JsonGuidance[];
};
```

TypeSafe currently documents 1–255 Choice options and 2–10 Score levels. Jev Trade's initial contract uses one three-option Choice and three four-level Scores.

Question IDs are application identifiers. Each question must repeat its complete meaning in `instructions`; the ID itself is not used for inference. Questions sharing one state should be sent in one request. They are evaluated independently, so one answer must never be treated as hidden context for another.

### Response envelope

The successful OpenRouter response has this shape:

```ts
type DecisionsResponse = {
  id?: string;
  model: string; // actual resolved model/build
  provider?: string;
  answers: Record<string, NoulAnswer | ChoiceAnswer | ScoreAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cost?: number;
  };
};

type NoulAnswer = {
  type: "noul";
  noul: number; // P(true), inclusive range [0, 1]
};

type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type ScoreAnswer = {
  type: "score";
  score: number; // probability-weighted index over the ordered levels
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};
```

OpenRouter adds `id`, `provider`, and `usage.cost` around the TypeSafe answer schema. Treat those envelope fields as provider metadata. Validate answer types strictly while permitting unknown additive top-level metadata so a harmless OpenRouter envelope addition does not break judgments.

## Jev Trade request

The live state must contain a canonical, compact snapshot of approved derived descriptors. It must not include raw licensed articles, provider-native payloads, markup, or an instruction-like blob from an external source.

This is an illustrative request, not a recorded market judgment:

```json
{
  "model": "typesafe/jev-1.13",
  "state": {
    "schema_version": "market-state-v1",
    "symbol": "ACME",
    "mode": "position",
    "horizon_sessions": 20,
    "cutoff": "2026-09-18T20:00:00Z",
    "outcome_definition": {
      "flat_band_percent": 2.0,
      "boundary_values_are_flat": true
    },
    "data_quality": {
      "freshness": "current_completed_session",
      "missing_required_fields": [],
      "corporate_action_pending": false
    },
    "trend": {
      "one_session": "small_gain",
      "five_session": "moderate_gain",
      "twenty_session": "positive",
      "sixty_session": "positive",
      "price_vs_ma20": "above",
      "price_vs_ma50": "above"
    },
    "momentum": {
      "rsi_regime": "neutral_positive",
      "relative_strength_vs_benchmark_20d": "outperforming"
    },
    "risk_context": {
      "realized_volatility_regime": "elevated",
      "atr_regime": "elevated",
      "drawdown_regime": "shallow",
      "gap_regime": "normal",
      "volume_regime": "normal"
    },
    "market_regime": "broad_market_uptrend",
    "known_events": {
      "earnings_within_horizon": true,
      "sessions_until_earnings": 8
    }
  },
  "questions": {
    "direction": {
      "type": "choice",
      "instructions": "Given the named market state and `outcome_definition`, which direction best describes the symbol's price at the end of `horizon_sessions` relative to the `cutoff` close? Make one fast semantic judgment. Do not calculate a return or position size.",
      "criteria": {
        "up": "More likely to finish above the upper edge of `outcome_definition.flat_band_percent` relative to the cutoff close.",
        "flat": "More likely to finish inside the inclusive band defined by `outcome_definition.flat_band_percent` around the cutoff close.",
        "down": "More likely to finish below the lower edge of `outcome_definition.flat_band_percent` relative to the cutoff close."
      }
    },
    "setup_quality": {
      "type": "score",
      "instructions": "How coherent is the directional setup across `trend`, `momentum`, `market_regime`, and `known_events`? Judge coherence only; do not compute risk or expected return.",
      "criteria": [
        "Poor: signals conflict or do not support a usable setup.",
        "Weak: some support exists, but conflicts dominate.",
        "Adequate: the main signals broadly agree with manageable conflicts.",
        "Strong: the supplied signals are unusually coherent for this horizon."
      ]
    },
    "downside_hazard": {
      "type": "score",
      "instructions": "How concerning is the semantic downside hazard in `risk_context`, `market_regime`, and `known_events` for this horizon? Do not calculate volatility, loss, stop distance, or position risk.",
      "criteria": [
        "Low: no meaningful semantic hazard is apparent in the supplied state.",
        "Moderate: a hazard exists but does not dominate the setup.",
        "High: one or more hazards materially threaten the setup.",
        "Severe: hazards dominate and make the setup fragile."
      ]
    },
    "evidence_sufficiency": {
      "type": "score",
      "instructions": "How sufficient is the supplied state for the other judgments? Treat missing, stale, ambiguous, or horizon-mismatched evidence as insufficient.",
      "criteria": [
        "Insufficient: the judgment lacks required or usable evidence.",
        "Thin: usable evidence exists, but important support is weak or missing.",
        "Adequate: the supplied evidence supports a bounded judgment.",
        "Rich: the supplied evidence is complete, relevant, and internally coherent."
      ]
    }
  },
  "session_id": "judgment-run-example"
}
```

Recommended optional attribution headers:

```text
HTTP-Referer: https://jev-trade.dev
X-Title: Jev Trade
```

Do not send a browser request directly to OpenRouter. The bearer credential belongs only in a server-side function or worker.

### Illustrative response

The numbers below are invented to show the schema. They are not a Jev result and must never enter the public ledger:

```json
{
  "id": "gen-dec-example",
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "answers": {
    "direction": {
      "type": "choice",
      "choice": "up",
      "probabilities": {
        "up": 0.64,
        "flat": 0.23,
        "down": 0.13
      },
      "confidence": 0.52
    },
    "setup_quality": {
      "type": "score",
      "score": 2.18,
      "legend": {
        "0": "Poor: signals conflict or do not support a usable setup.",
        "1": "Weak: some support exists, but conflicts dominate.",
        "2": "Adequate: the main signals broadly agree with manageable conflicts.",
        "3": "Strong: the supplied signals are unusually coherent for this horizon."
      },
      "probabilities": {
        "0": 0.04,
        "1": 0.17,
        "2": 0.36,
        "3": 0.43
      },
      "confidence": 0.38
    },
    "downside_hazard": {
      "type": "score",
      "score": 1.42,
      "legend": {
        "0": "Low: no meaningful semantic hazard is apparent in the supplied state.",
        "1": "Moderate: a hazard exists but does not dominate the setup.",
        "2": "High: one or more hazards materially threaten the setup.",
        "3": "Severe: hazards dominate and make the setup fragile."
      },
      "probabilities": {
        "0": 0.12,
        "1": 0.46,
        "2": 0.3,
        "3": 0.12
      },
      "confidence": 0.31
    },
    "evidence_sufficiency": {
      "type": "score",
      "score": 2.25,
      "legend": {
        "0": "Insufficient: the judgment lacks required or usable evidence.",
        "1": "Thin: usable evidence exists, but important support is weak or missing.",
        "2": "Adequate: the supplied evidence supports a bounded judgment.",
        "3": "Rich: the supplied evidence is complete, relevant, and internally coherent."
      },
      "probabilities": {
        "0": 0.03,
        "1": 0.14,
        "2": 0.38,
        "3": 0.45
      },
      "confidence": 0.43
    }
  },
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 100,
    "cost": 0.0000504
  }
}
```

## Confidence and probability semantics

The UI and policy must preserve these distinctions:

| Value | Meaning | It does not mean |
|---|---|---|
| Choice `probabilities.up` | Jev's probability mass assigned to the `up` option relative to this exact state, question, and option set | Chance of profit, expected return, or historical win rate |
| Choice `confidence` | A TypeSafe statistic summarizing how concentrated the full Choice distribution is | Probability that the chosen class is correct |
| Score `score` | Probability-weighted position on the ordered rubric's zero-based indices | A percentage, exact physical measurement, or risk amount |
| Score `confidence` | Concentration of the Score level distribution | Accuracy or a guarantee that the score is numerically calibrated |
| Noul `noul` | Model probability that the directly stated yes/no condition is true | A medium degree of a property when it is near 0.5 |
| Deterministic market risk | Code-owned index from exact market inputs | Jev confidence |
| Paper position risk | Code-owned loss budget and sizing result | Jev distribution or market-risk index |

TypeSafe says calibration is evaluated over groups of predictions and does not guarantee an individual answer. Confidence is derived from distribution shape; TypeSafe does not publish a formula that Jev Trade should reimplement. Store and use the provider's returned confidence value.

Noul has no separate confidence field. Do not invent one and do not transfer a threshold tuned for Choice to Noul. TypeSafe also warns that a question and its negation need not obey an arithmetic complement across independent evaluations.

For the public interface:

- Label direction bars **Jev judgment distribution**.
- Label confidence **distribution concentration** in explanatory copy.
- Show deterministic market risk and paper position risk in separate cards.
- Keep the exact numeric distributions available on the permanent forecast page.
- State that the distribution is not calibrated as a probability of making money.

## Recommended adapter contract

The domain layer should depend on this contract, not on OpenRouter's response type:

```ts
type JevFailureCode =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "INSUFFICIENT_CREDITS"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "MODEL_DRIFT"
  | "BUDGET_EXHAUSTED";

type JevEvaluateInput = {
  runId: string;
  state: CanonicalMarketStateV1;
  questions: JudgmentQuestionSetV1;
  requestedModel: string;
  expectedResolvedModel: string;
  stateHash: string;
  questionSetVersion: string;
  deadlineMs: number;
};

type JevAttemptReceipt = {
  attempt: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  httpStatus?: number;
  retryAfterMs?: number;
  providerRequestId?: string;
  outcome: "success" | "retryable_failure" | "terminal_failure";
  failureCode?: JevFailureCode;
};

type JevEvaluation = {
  provider: "openrouter";
  requestedModel: string;
  resolvedModel: string;
  providerName?: string;
  providerRequestId?: string;
  stateHash: string;
  questionSetVersion: string;
  answers: ValidatedJudgmentAnswers;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd?: number;
  };
  requestHash: string;
  responseHash: string;
  attempts: JevAttemptReceipt[];
};

type JevResult =
  | { ok: true; value: JevEvaluation }
  | {
      ok: false;
      code: JevFailureCode;
      retryable: boolean;
      safeMessage: string;
      attempts: JevAttemptReceipt[];
    };

interface JevProvider {
  readonly id: "openrouter" | "fixture" | "vercel-gateway";
  evaluate(input: JevEvaluateInput, signal?: AbortSignal): Promise<JevResult>;
}
```

Implementation rules:

1. Construct and canonicalize the request in domain code before transport.
2. Hash the canonical request with the credential and attribution headers excluded.
3. Use `OPENROUTER_API_KEY` only in the server-side transport.
4. Combine the caller's abort signal with a per-attempt timeout.
5. Read response text once, cap its size, parse JSON, then validate it.
6. Never include authorization headers, provider keys, or full raw error bodies in logs.
7. Retain a bounded redacted error summary and hash for operations; expose only the classified failure publicly.
8. Append an attempt receipt for every billable or network attempt.
9. Return success only after strict semantic validation and the model-version gate.
10. Apply policy in a separate pure function after the adapter returns success.

Use native `fetch` plus a runtime schema validator for the first adapter. The official OpenRouter SDK is viable, but a small explicit transport keeps the alpha path, timeouts, retries, body-size limit, redaction, and model gate visible. If the SDK is adopted, wrap it behind the same contract and pin its exact package version.

## Response validation

Validation must check more than JSON shape:

- `answers` contains exactly the four expected IDs.
- Each answer discriminator matches its request question type.
- Choice keys exactly match `up`, `flat`, and `down`.
- Choice selection is a supplied option and is among the maximum-probability options within rounding tolerance.
- Score probability keys exactly match `0` through `3`.
- Score legend text exactly matches the submitted versioned criteria.
- All probabilities and confidence values are finite and in `[0, 1]`.
- Each distribution sums to 1 within `PROBABILITY_SUM_TOLERANCE = 1e-3`.
- Each Score is finite and inside `[0, 3]`.
- A Score is consistent with its probability-weighted level index within a documented response-rounding tolerance, recommended `0.02` initially.
- `usage.input_tokens` and `usage.output_tokens` are non-negative integers; `cost`, when present, is finite and non-negative.
- `model` equals the approved resolved model.
- The response body stays below a small configured limit, recommended 256 KiB.

Reject unknown answer types. Permit unknown additive fields only outside the typed answers and preserve them in neither policy inputs nor public output.

The adapter should not silently repair invalid distributions, clamp values, infer missing answers, or replace Jev with a language model. Such behavior would make the evidence irreproducible.

## Model pinning and change control

OpenRouter's official request ID is `typesafe/jev-1.13`. Its current endpoint metadata and example response identify `typesafe/jev-1.13-20260917` as the resolved provider build. The MIT reference also reports the dated value as an accepted pinned name, but OpenRouter's primary model page presents the family version as the public request ID.

Use this two-part gate for the first smoke test:

```text
requestedModel        = typesafe/jev-1.13
expectedResolvedModel = typesafe/jev-1.13-20260917
```

If the authenticated smoke test confirms that the dated ID is accepted as a request model, switch `requestedModel` to that exact ID. In both cases:

- Persist both requested and returned model IDs.
- Classify an unexpected return as `MODEL_DRIFT`.
- Store the failed attempt, but publish no scored forecast and take no new paper action.
- Evaluate a fixed labeled cohort before approving another build.
- Publish a new judgment-contract version when the approved model changes.
- Allow moving aliases such as `~typesafe/jev-latest` only in a visibly unscored sandbox.

Never let a latest alias enter the prospective scorecard. A moving alias changes behavior without a repository change and makes threshold history ambiguous.

## Errors, timeouts, and retries

OpenRouter documents `400`, `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `503`, `524`, and `529` for the Decisions endpoint. TypeSafe separately documents `422`, `429`, and `529` for its native endpoint.

Recommended classification:

| Condition | Retry? | Jev Trade code | Behavior |
|---|---:|---|---|
| Missing key or invalid local config | No | `CONFIGURATION` | Fail before network call |
| `400` or `422` | No | `INVALID_REQUEST` | Record schema/detail hash; alert developer |
| `401` or credential-related `403` | No | `AUTHENTICATION` | Alert operator; never log key/header |
| `402` | No | `INSUFFICIENT_CREDITS` | Alert budget owner; no forecast |
| `404` | No | `INVALID_REQUEST` | Treat as endpoint/model drift; investigate |
| `413` | No | `PAYLOAD_TOO_LARGE` | Fix state construction; do not truncate silently |
| `429` | Yes | `RATE_LIMITED` | Honor `Retry-After`, then bounded retry |
| `408`, network reset, DNS error, timeout | Yes | `TIMEOUT` or `PROVIDER_UNAVAILABLE` | Bounded retry with jitter |
| `500`, `502`, `503`, `504`, `520`, `521`, `522`, `524`, `529` | Yes | `PROVIDER_UNAVAILABLE` | Bounded retry with jitter |
| Valid HTTP with invalid typed body | No | `INVALID_RESPONSE` | Preserve hashes; alert schema drift |
| Returned model is not approved | No | `MODEL_DRIFT` | Quarantine result; no policy action |

Start with three total attempts, not three retries. Suggested defaults:

```text
per-attempt timeout: 20 seconds
backoff: full jitter capped at 5 seconds
base delays: 250 ms, then 1 second
total run deadline: 50 seconds
```

Honor a valid `Retry-After` header when it fits inside the run deadline. Do not retry after the deadline or daily cost budget. Retries may be billable, so include them in the usage ledger and budget calculation.

On exhaustion, append `JUDGMENT_FAILED`; do not reuse an old judgment as current and do not fabricate fixture output. Existing paper positions remain governed by deterministic stop and horizon rules.

## Context and state limits

TypeSafe documents a 64K total request budget and a 32K budget for state plus the longest question on its native Jev 1.13 endpoint. OpenRouter currently displays a 32K context figure for its Jev listing. Treat the lower 32K figure as the integration ceiling until a live OpenRouter probe establishes otherwise.

The adapter should enforce a conservative application budget before sending. More context is not automatically better: TypeSafe documents lower accuracy when irrelevant detail enters state. For Jev Trade:

- Send derived descriptors and named buckets, with exact source values retained in the market snapshot for audit.
- Send only fields relevant to the four questions.
- Compute counts, returns, volatility, dates, event windows, thresholds, and missing-data rules in code.
- Use fixed schema and question versions so semantically identical snapshots serialize identically.
- Reject required-data gaps before Jev instead of asking Jev to guess.
- Treat any externally sourced text as data and keep instructions and criteria application-owned.

## Vercel AI Gateway and AI SDK

Vercel can serve Jev through its own Gateway path:

```ts
import { experimental_evaluate } from "ai";

const result = await experimental_evaluate({
  model: "typesafe-ai/jev",
  state,
  questions: {
    direction: {
      type: "choice",
      instructions: "...",
      criteria: { up: "...", flat: "...", down: "..." },
    },
    // AI SDK calls the Jev Noul abstraction `boolean` when one is needed.
  },
});
```

This route uses `AI_GATEWAY_API_KEY` locally or Vercel OIDC in a deployed project. It reaches TypeSafe through Vercel's Gateway, not through OpenRouter's `/api/alpha/decisions` endpoint.

As of the research date, Vercel's official BYOK documentation does not list OpenRouter as a request-scoped credential provider. Therefore:

- `npx vercel ai-gateway setup` can configure Vercel Gateway authentication for the project.
- It does not turn an OpenRouter API key into a Vercel Gateway credential.
- It does not proxy OpenRouter's alpha Decisions endpoint.
- The supplied OpenRouter key should be used by the direct OpenRouter adapter.

Vercel Gateway remains a sensible later adapter for Vercel-native OIDC, observability, and spend controls. Keep it behind `JevProvider`, normalize its `boolean` naming to the internal Noul shape when needed, and run the same golden cohort before switching. Do not silently fail over between OpenRouter and Vercel in scored mode: transport/provider changes can change the resolved model or metadata and must be explicit in the ledger.

The AI SDK evaluation surface is experimental and may change in patch releases. If used, pin the exact `ai` and Gateway package versions and keep contract tests around the normalized result.

## Test plan

### Offline unit tests

1. **Canonical request:** the same market state and question version produce byte-identical canonical JSON and request hash.
2. **Credential isolation:** request hashing, debug output, and error receipts never contain `OPENROUTER_API_KEY` or the `Authorization` header.
3. **All primitive serialization:** Choice, Score, and Noul keep their `type` discriminators; optional fields are omitted instead of sent as `null` unless the contract permits `null`.
4. **Initial question set:** the request contains exactly `direction`, `setup_quality`, `downside_hazard`, and `evidence_sufficiency` with frozen criteria ordering.
5. **Shared state:** all four questions are sent in one request, and no per-answer output is fed into another question.
6. **Happy response:** the illustrative response normalizes without losing any distribution or confidence value.
7. **Missing answer:** absence of any expected ID yields `INVALID_RESPONSE`.
8. **Extra answer:** an unknown answer ID yields `INVALID_RESPONSE`.
9. **Type mismatch:** a Noul returned for `direction` yields `INVALID_RESPONSE`.
10. **Unknown option:** a Choice value or probability key outside `up|flat|down` is rejected.
11. **Bad distribution:** negative, greater-than-one, `NaN`, infinite, or non-normalized probabilities are rejected.
12. **Bad confidence:** missing, non-finite, or out-of-range Choice/Score confidence is rejected.
13. **Bad score:** a score outside `0..3`, wrong legend, wrong level keys, or weighted-mean mismatch is rejected.
14. **Noul semantics:** values outside `[0,1]` are rejected and no confidence field is fabricated.
15. **Model drift:** a valid body from an unexpected resolved model returns `MODEL_DRIFT` and no answers reach policy.
16. **Body limit:** an oversized response is aborted and classified without including its body in logs.

### Mock transport tests

17. **URL and method:** the adapter sends one `POST` to `https://openrouter.ai/api/alpha/decisions`.
18. **Headers:** bearer auth and JSON content type are present; attribution headers are stable; the key is never exposed to the returned receipt.
19. **No chat route:** no code path calls `/chat/completions` for Jev.
20. **Timeout:** an aborted fetch retries within the configured attempt/deadline bound and ends as `TIMEOUT` when exhausted.
21. **Transient recovery:** two `503` responses followed by `200` create three ordered attempt receipts and one success.
22. **Rate-limit handling:** `429` honors a bounded `Retry-After` value.
23. **Terminal 4xx:** `400`, `401`, `402`, `403`, `404`, `413`, and `422` receive one attempt only and map to their failure codes.
24. **Retry ceiling:** persistent transient failures stop after three total attempts and never sleep after the final attempt.
25. **Retry budget:** a retry is skipped when it would exceed the run deadline or daily provider budget.
26. **Malformed JSON:** a `200` response containing HTML or malformed JSON is `INVALID_RESPONSE`, with only a bounded redacted summary retained.
27. **Idempotent scheduler behavior:** retrying a failed judgment run appends a new attempt and cannot overwrite a successful published forecast.
28. **Policy separation:** no provider error, fixture response, or partial answer invokes entry/hold/exit policy.

### Authenticated smoke tests

Run these only from the server environment with a low spend cap. Never print the key or full environment.

29. **Endpoint smoke:** send a tiny state with one Choice and verify a typed response from `/api/alpha/decisions`.
30. **Model resolution:** confirm the returned model and freeze it as `expectedResolvedModel`.
31. **Dated pin probe:** test whether `typesafe/jev-1.13-20260917` is accepted as the request model; use it only after success.
32. **Four-question contract:** send the exact Jev Trade v1 questions and validate all distributions, legends, confidence values, usage, ID, and provider.
33. **Repeatability cohort:** evaluate a frozen set of representative market states repeatedly, recording variation without allowing the runs into the public scorecard.
34. **Known failure:** send one intentionally invalid request and verify error classification and redaction.
35. **Spend accounting:** compare OpenRouter's reported usage/cost with the internal attempt ledger.

### Gateway compatibility tests, only if that adapter is added

36. **Gateway model:** `experimental_evaluate` accepts the current official Jev Gateway ID under a pinned AI SDK version.
37. **Normalization parity:** Vercel Choice/Score/Boolean results normalize to the internal contract without inventing fields.
38. **Credential separation:** Gateway uses OIDC or `AI_GATEWAY_API_KEY`; the OpenRouter key is never passed to it.
39. **No silent transport fallback:** an OpenRouter failure does not automatically publish a Gateway judgment under the same run.

## Live implementation gate

Before scored live mode, retain one redacted receipt proving:

- the OpenRouter Decisions endpoint returned `200`;
- the request used the approved versioned model;
- the returned resolved model matched the approved build;
- the four-question response passed strict validation;
- the cost and token counts were recorded;
- no raw licensed text, provider payload, credential, or personal data entered the request or logs;
- the processor/data-handling record for the transmitted state was approved.

Until that receipt exists, the app may use the fixture adapter and may show a clearly labeled private or demo mode. It must not publish fixture output as a live Jev market judgment.
