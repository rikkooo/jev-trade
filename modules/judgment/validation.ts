import {
  JUDGMENT_QUESTION_IDS,
  PROBABILITY_SUM_TOLERANCE,
  SCORE_ROUNDING_TOLERANCE,
  type ChoiceAnswer,
  type Direction,
  type JudgmentAnswers,
  type JudgmentUsage,
  type ScoreAnswer,
  type ScoreLevel,
  type ScoreQuestionId,
  type ValidatedDecisionsResponse,
} from "./contracts";
import { JudgmentProviderError } from "./errors";
import { SCORE_LEGENDS } from "./questions/v1";

const DIRECTIONS = ["up", "flat", "down"] as const;
const SCORE_LEVELS = ["0", "1", "2", "3"] as const;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalid();
  return value as Record<string, unknown>;
}

function invalid(
  code: "INVALID_RESPONSE" | "MODEL_DRIFT" = "INVALID_RESPONSE",
): never {
  throw new JudgmentProviderError(code, false);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    invalid();
  }
}

function finiteUnit(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    invalid();
  }
  return value;
}

function distribution(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, number>> {
  const input = record(value);
  exactKeys(input, keys);
  const output = Object.fromEntries(
    keys.map((key) => [key, finiteUnit(input[key])]),
  );
  const sum = Object.values(output).reduce((total, item) => total + item, 0);
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) invalid();
  return Object.freeze(output);
}

function choiceAnswer(value: unknown): ChoiceAnswer {
  const answer = record(value);
  exactKeys(answer, ["type", "choice", "probabilities", "confidence"]);
  if (
    answer.type !== "choice" ||
    !DIRECTIONS.includes(answer.choice as Direction)
  )
    invalid();
  const probabilities = distribution(
    answer.probabilities,
    DIRECTIONS,
  ) as Readonly<Record<Direction, number>>;
  const choice = answer.choice as Direction;
  const maximum = Math.max(...Object.values(probabilities));
  if (maximum - probabilities[choice] > PROBABILITY_SUM_TOLERANCE) invalid();
  return Object.freeze({
    type: "choice",
    choice,
    probabilities,
    confidence: finiteUnit(answer.confidence),
  });
}

function scoreAnswer(value: unknown, question: ScoreQuestionId): ScoreAnswer {
  const answer = record(value);
  exactKeys(answer, ["type", "score", "legend", "probabilities", "confidence"]);
  if (
    answer.type !== "score" ||
    typeof answer.score !== "number" ||
    !Number.isFinite(answer.score) ||
    answer.score < 0 ||
    answer.score > 3
  ) {
    invalid();
  }
  const legendInput = record(answer.legend);
  exactKeys(legendInput, SCORE_LEVELS);
  for (const level of SCORE_LEVELS) {
    if (legendInput[level] !== SCORE_LEGENDS[question][level]) invalid();
  }
  const probabilities = distribution(
    answer.probabilities,
    SCORE_LEVELS,
  ) as Readonly<Record<ScoreLevel, number>>;
  const weighted = SCORE_LEVELS.reduce(
    (total, level) => total + Number(level) * probabilities[level],
    0,
  );
  if (Math.abs(weighted - answer.score) > SCORE_ROUNDING_TOLERANCE) invalid();
  return Object.freeze({
    type: "score",
    score: answer.score,
    legend: SCORE_LEGENDS[question],
    probabilities,
    confidence: finiteUnit(answer.confidence),
  });
}

function usage(value: unknown): JudgmentUsage {
  const input = record(value);
  const allowed = ["input_tokens", "output_tokens", "cost"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) invalid();
  if (
    !Number.isInteger(input.input_tokens) ||
    (input.input_tokens as number) < 0 ||
    !Number.isInteger(input.output_tokens) ||
    (input.output_tokens as number) < 0
  ) {
    invalid();
  }
  if (
    input.cost !== undefined &&
    (typeof input.cost !== "number" ||
      !Number.isFinite(input.cost) ||
      input.cost < 0)
  ) {
    invalid();
  }
  return Object.freeze({
    input_tokens: input.input_tokens as number,
    output_tokens: input.output_tokens as number,
    ...(input.cost === undefined ? {} : { cost: input.cost as number }),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export function validateDecisionsResponse(
  value: unknown,
  options: { readonly expectedResolvedModel?: string },
): ValidatedDecisionsResponse {
  const body = record(value);
  if (typeof body.model !== "string" || !body.model) invalid();
  if (
    options.expectedResolvedModel !== undefined &&
    body.model !== options.expectedResolvedModel
  ) {
    invalid("MODEL_DRIFT");
  }
  if (body.id !== undefined && (typeof body.id !== "string" || !body.id))
    invalid();
  if (body.provider !== undefined && typeof body.provider !== "string")
    invalid();
  const rawAnswers = record(body.answers);
  exactKeys(rawAnswers, JUDGMENT_QUESTION_IDS);
  const answers: JudgmentAnswers = {
    direction: choiceAnswer(rawAnswers.direction),
    setup_quality: scoreAnswer(rawAnswers.setup_quality, "setup_quality"),
    downside_hazard: scoreAnswer(rawAnswers.downside_hazard, "downside_hazard"),
    evidence_sufficiency: scoreAnswer(
      rawAnswers.evidence_sufficiency,
      "evidence_sufficiency",
    ),
  };
  return deepFreeze({
    ...(body.id === undefined ? {} : { id: body.id as string }),
    model: body.model,
    ...(body.provider === undefined
      ? {}
      : { provider: body.provider as string }),
    answers,
    usage: usage(body.usage),
  });
}

class DuplicateSafeJsonParser {
  #index = 0;
  #depth = 0;

  constructor(private readonly text: string) {}

  parse(): unknown {
    const value = this.#value();
    this.#space();
    if (this.#index !== this.text.length) invalid();
    return value;
  }

  #space(): void {
    while (/\s/.test(this.text[this.#index] ?? "")) this.#index += 1;
  }

  #value(): unknown {
    this.#space();
    if (++this.#depth > 100) invalid();
    try {
      const character = this.text[this.#index];
      if (character === "{") return this.#object();
      if (character === "[") return this.#array();
      if (character === '"') return this.#string();
      for (const [token, value] of [
        ["true", true],
        ["false", false],
        ["null", null],
      ] as const) {
        if (this.text.startsWith(token, this.#index)) {
          this.#index += token.length;
          return value;
        }
      }
      const match = this.text
        .slice(this.#index)
        .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) invalid();
      this.#index += match[0].length;
      const number = Number(match[0]);
      if (!Number.isFinite(number)) invalid();
      return number;
    } finally {
      this.#depth -= 1;
    }
  }

  #string(): string {
    const start = this.#index++;
    while (this.#index < this.text.length) {
      const character = this.text[this.#index++];
      if (character === '"') {
        try {
          return JSON.parse(this.text.slice(start, this.#index)) as string;
        } catch {
          invalid();
        }
      }
      if (character === "\\") this.#index += 1;
      else if (character !== undefined && character.charCodeAt(0) < 0x20)
        invalid();
    }
    invalid();
  }

  #object(): Record<string, unknown> {
    this.#index += 1;
    const output: Record<string, unknown> = {};
    const keys = new Set<string>();
    this.#space();
    if (this.text[this.#index] === "}") {
      this.#index += 1;
      return output;
    }
    for (;;) {
      this.#space();
      if (this.text[this.#index] !== '"') invalid();
      const key = this.#string();
      if (keys.has(key)) invalid();
      keys.add(key);
      this.#space();
      if (this.text[this.#index++] !== ":") invalid();
      output[key] = this.#value();
      this.#space();
      const separator = this.text[this.#index++];
      if (separator === "}") return output;
      if (separator !== ",") invalid();
    }
  }

  #array(): unknown[] {
    this.#index += 1;
    const output: unknown[] = [];
    this.#space();
    if (this.text[this.#index] === "]") {
      this.#index += 1;
      return output;
    }
    for (;;) {
      output.push(this.#value());
      this.#space();
      const separator = this.text[this.#index++];
      if (separator === "]") return output;
      if (separator !== ",") invalid();
    }
  }
}

export function parseAndValidateDecisionsResponse(
  text: string,
  options: { readonly expectedResolvedModel?: string },
): ValidatedDecisionsResponse {
  try {
    return validateDecisionsResponse(
      new DuplicateSafeJsonParser(text).parse(),
      options,
    );
  } catch (error) {
    if (error instanceof JudgmentProviderError) throw error;
    invalid();
  }
}
