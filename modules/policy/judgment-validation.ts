import {
  PROBABILITY_SUM_TOLERANCE,
  SCORE_ROUNDING_TOLERANCE,
} from "@/modules/judgment/contracts";
import type {
  Direction,
  JudgmentAnswers,
  ScoreAnswer,
} from "@/modules/judgment/contracts";

const DIRECTIONS = ["up", "flat", "down"] as const;
const SCORE_LEVELS = ["0", "1", "2", "3"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteUnit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function validDistribution(
  value: unknown,
  keys: readonly string[],
): value is Record<string, number> {
  const distribution = record(value);
  if (!distribution) return false;
  if (
    Object.keys(distribution).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(distribution, key))
  ) {
    return false;
  }
  const probabilities = keys.map((key) => distribution[key]);
  return (
    probabilities.every(finiteUnit) &&
    Math.abs(
      probabilities.reduce((sum, probability) => sum + probability, 0) - 1,
    ) <= PROBABILITY_SUM_TOLERANCE
  );
}

function validDirection(value: unknown): boolean {
  const answer = record(value);
  if (!answer || answer.type !== "choice") return false;
  if (!DIRECTIONS.includes(answer.choice as Direction)) return false;
  if (!finiteUnit(answer.confidence)) return false;
  if (!validDistribution(answer.probabilities, DIRECTIONS)) return false;

  const probabilities = answer.probabilities as Record<Direction, number>;
  const choice = answer.choice as Direction;
  const maximum = Math.max(...DIRECTIONS.map((key) => probabilities[key]));
  return maximum - probabilities[choice] <= PROBABILITY_SUM_TOLERANCE;
}

function validScore(value: unknown): value is ScoreAnswer {
  const answer = record(value);
  if (
    !answer ||
    answer.type !== "score" ||
    typeof answer.score !== "number" ||
    !Number.isFinite(answer.score) ||
    answer.score < 0 ||
    answer.score > 3 ||
    !finiteUnit(answer.confidence) ||
    !validDistribution(answer.probabilities, SCORE_LEVELS)
  ) {
    return false;
  }
  const legend = record(answer.legend);
  if (
    !legend ||
    Object.keys(legend).length !== SCORE_LEVELS.length ||
    !SCORE_LEVELS.every(
      (level) =>
        Object.hasOwn(legend, level) && typeof legend[level] === "string",
    )
  ) {
    return false;
  }
  const probabilities = answer.probabilities as Record<
    (typeof SCORE_LEVELS)[number],
    number
  >;
  const weightedScore = SCORE_LEVELS.reduce(
    (sum, level) => sum + Number(level) * probabilities[level],
    0,
  );
  return Math.abs(weightedScore - answer.score) <= SCORE_ROUNDING_TOLERANCE;
}

export function isPolicyJudgmentValid(
  value: unknown,
): value is JudgmentAnswers {
  const answers = record(value);
  if (!answers) return false;
  return (
    validDirection(answers.direction) &&
    validScore(answers.setup_quality) &&
    validScore(answers.downside_hazard) &&
    validScore(answers.evidence_sufficiency)
  );
}
