import type {
  ChoiceAnswer,
  JudgmentAnswers,
  ScoreAnswer,
} from "@/modules/judgment/contracts";

const SCORE_LEGEND = {
  "0": "level 0",
  "1": "level 1",
  "2": "level 2",
  "3": "level 3",
} as const;

function score(scoreValue: number, confidence: number): ScoreAnswer {
  const lower = Math.max(0, Math.min(3, Math.floor(scoreValue)));
  const upper = Math.max(0, Math.min(3, Math.ceil(scoreValue)));
  const upperWeight = scoreValue - lower;
  const probabilities: Record<"0" | "1" | "2" | "3", number> = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
  };
  probabilities[String(lower) as keyof typeof probabilities] =
    lower === upper ? 1 : 1 - upperWeight;
  if (upper !== lower) {
    probabilities[String(upper) as keyof typeof probabilities] = upperWeight;
  }
  return {
    type: "score",
    score: scoreValue,
    confidence,
    legend: SCORE_LEGEND,
    probabilities,
  };
}

export function buildPolicyJudgment(
  overrides: {
    direction?: Partial<ChoiceAnswer>;
    setupQuality?: { score?: number; confidence?: number };
    downsideHazard?: { score?: number; confidence?: number };
    evidenceSufficiency?: { score?: number; confidence?: number };
  } = {},
): JudgmentAnswers {
  const direction: ChoiceAnswer = {
    type: "choice",
    choice: "up",
    probabilities: { up: 0.7, flat: 0.2, down: 0.1 },
    confidence: 0.75,
    ...overrides.direction,
  };

  return {
    direction,
    setup_quality: score(
      overrides.setupQuality?.score ?? 2.5,
      overrides.setupQuality?.confidence ?? 0.75,
    ),
    downside_hazard: score(
      overrides.downsideHazard?.score ?? 1,
      overrides.downsideHazard?.confidence ?? 0.75,
    ),
    evidence_sufficiency: score(
      overrides.evidenceSufficiency?.score ?? 2.5,
      overrides.evidenceSufficiency?.confidence ?? 0.75,
    ),
  };
}
