import { describe, expect, it } from "vitest";

import {
  EXPECTED_RESOLVED_MODEL,
  JudgmentProviderError,
  parseAndValidateDecisionsResponse,
  sanitizeJudgmentError,
  validateDecisionsResponse,
} from "./index";
import { SCORE_LEGENDS } from "./questions/v1";

export function validResponse(model: string = EXPECTED_RESOLVED_MODEL) {
  return {
    id: "gen-dec-test",
    model,
    provider: "TypeSafe",
    answers: {
      direction: {
        type: "choice",
        choice: "up",
        probabilities: { up: 0.64, flat: 0.23, down: 0.13 },
        confidence: 0.52,
      },
      setup_quality: {
        type: "score",
        score: 2.18,
        legend: { ...SCORE_LEGENDS.setup_quality },
        probabilities: { 0: 0.04, 1: 0.17, 2: 0.36, 3: 0.43 },
        confidence: 0.38,
      },
      downside_hazard: {
        type: "score",
        score: 1.42,
        legend: { ...SCORE_LEGENDS.downside_hazard },
        probabilities: { 0: 0.12, 1: 0.46, 2: 0.3, 3: 0.12 },
        confidence: 0.31,
      },
      evidence_sufficiency: {
        type: "score",
        score: 2.25,
        legend: { ...SCORE_LEGENDS.evidence_sufficiency },
        probabilities: { 0: 0.03, 1: 0.14, 2: 0.38, 3: 0.45 },
        confidence: 0.43,
      },
    },
    usage: { input_tokens: 1200, output_tokens: 100, cost: 0.0000504 },
  };
}

function expectInvalid(
  mutate: (body: ReturnType<typeof validResponse>) => void,
) {
  const body = structuredClone(validResponse());
  mutate(body);
  expect(() =>
    validateDecisionsResponse(body, {
      expectedResolvedModel: EXPECTED_RESOLVED_MODEL,
    }),
  ).toThrowError(expect.objectContaining({ code: "INVALID_RESPONSE" }));
}

describe("strict Decisions response validation", () => {
  it("preserves every provider distribution, score, confidence, and usage value", () => {
    const input = validResponse();
    const output = validateDecisionsResponse(input, {
      expectedResolvedModel: EXPECTED_RESOLVED_MODEL,
    });
    expect(output.answers).toEqual(input.answers);
    expect(output.usage).toEqual(input.usage);
  });

  it("rejects missing, extra, mismatched, and unknown answers", () => {
    expectInvalid(
      (body) => delete (body.answers as Partial<typeof body.answers>).direction,
    );
    expectInvalid((body) =>
      Object.assign(body.answers, { surprise: body.answers.direction }),
    );
    expectInvalid((body) =>
      Object.assign(body.answers.direction, { type: "noul" }),
    );
    expectInvalid((body) =>
      Object.assign(body.answers.direction, { choice: "sideways" }),
    );
    expectInvalid((body) =>
      Object.assign(body.answers.direction.probabilities, { sideways: 0 }),
    );
  });

  it("rejects invalid probability, confidence, score, legend, and weighted means", () => {
    expectInvalid((body) => (body.answers.direction.probabilities.up = -0.1));
    expectInvalid((body) => (body.answers.direction.probabilities.up = 0.9));
    expectInvalid((body) => (body.answers.direction.confidence = Number.NaN));
    expectInvalid((body) => (body.answers.setup_quality.score = 4));
    expectInvalid((body) => (body.answers.setup_quality.score = 1.1));
    expectInvalid(
      (body) => (body.answers.setup_quality.legend["0"] = "changed"),
    );
  });

  it("rejects a selected choice that is not a maximum-probability option", () => {
    expectInvalid((body) => (body.answers.direction.choice = "down"));
  });

  it("classifies an unexpected resolved model as drift", () => {
    expect(() =>
      validateDecisionsResponse(validResponse("typesafe/jev-future"), {
        expectedResolvedModel: EXPECTED_RESOLVED_MODEL,
      }),
    ).toThrowError(expect.objectContaining({ code: "MODEL_DRIFT" }));
  });

  it("permits an unpinned model only in the caller's sandbox validation path", () => {
    expect(
      validateDecisionsResponse(validResponse("~typesafe/jev-latest"), {}),
    ).toMatchObject({ model: "~typesafe/jev-latest" });
  });

  it("rejects duplicate JSON object keys instead of accepting the last value", () => {
    const text = JSON.stringify(validResponse()).replace(
      '"answers":{',
      '"answers":{"direction":null,"direction":',
    );
    expect(() => parseAndValidateDecisionsResponse(text, {})).toThrowError(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });

  it("sanitizes errors without retaining secrets or response bodies", () => {
    const secret = "sk-or-v1-never-show-this-value";
    const error = new JudgmentProviderError("AUTHENTICATION", false, [
      { attempt: 1, code: "AUTHENTICATION", durationMs: 4, status: 401 },
    ]);
    (error as unknown as { accidental?: string }).accidental = secret;
    expect(JSON.stringify(sanitizeJudgmentError(error))).not.toContain(secret);
  });
});
