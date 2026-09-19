import type {
  JudgmentQuestions,
  ScoreQuestionId,
  ScoreLevel,
} from "../contracts";
import { deepFreeze } from "../deep-freeze";

export const SCORE_LEGENDS: Readonly<
  Record<ScoreQuestionId, Readonly<Record<ScoreLevel, string>>>
> = deepFreeze({
  setup_quality: {
    "0": "Poor: signals conflict or do not support a usable setup.",
    "1": "Weak: some support exists, but conflicts dominate.",
    "2": "Adequate: the main signals broadly agree with manageable conflicts.",
    "3": "Strong: the supplied signals are unusually coherent for this horizon.",
  },
  downside_hazard: {
    "0": "Low: no meaningful semantic hazard is apparent in the supplied state.",
    "1": "Moderate: a hazard exists but does not dominate the setup.",
    "2": "High: one or more hazards materially threaten the setup.",
    "3": "Severe: hazards dominate and make the setup fragile.",
  },
  evidence_sufficiency: {
    "0": "Insufficient: the judgment lacks required or usable evidence.",
    "1": "Thin: usable evidence exists, but important support is weak or missing.",
    "2": "Adequate: the supplied evidence supports a bounded judgment.",
    "3": "Rich: the supplied evidence is complete, relevant, and internally coherent.",
  },
});

export const JUDGMENT_QUESTIONS_V1: JudgmentQuestions = deepFreeze({
  direction: {
    type: "choice",
    instructions:
      "Given the named market state and `outcome_definition`, which direction best describes the symbol's price at the end of `horizon_sessions` relative to the `cutoff_session` close? Make one fast semantic judgment. Do not calculate a return or position size.",
    criteria: {
      up: "More likely to finish above the upper edge of `outcome_definition.flat_band_percent` relative to the cutoff close.",
      flat: "More likely to finish inside the inclusive band defined by `outcome_definition.flat_band_percent` around the cutoff close.",
      down: "More likely to finish below the lower edge of `outcome_definition.flat_band_percent` relative to the cutoff close.",
    },
  },
  setup_quality: {
    type: "score",
    instructions:
      "How coherent is the directional setup across `features.trend`, `features.relativeStrength`, `features.benchmarkRegime`, and `upcoming_known_events`? Judge coherence only; do not compute risk or expected return.",
    criteria: Object.values(SCORE_LEGENDS.setup_quality) as [
      string,
      string,
      string,
      string,
    ],
  },
  downside_hazard: {
    type: "score",
    instructions:
      "How concerning is the semantic downside hazard in the supplied risk features, benchmark regime, and upcoming known events for this horizon? Do not calculate volatility, loss, stop distance, or position risk.",
    criteria: Object.values(SCORE_LEGENDS.downside_hazard) as [
      string,
      string,
      string,
      string,
    ],
  },
  evidence_sufficiency: {
    type: "score",
    instructions:
      "How sufficient is the supplied state for the other judgments? Treat missing, stale, ambiguous, or horizon-mismatched evidence as insufficient.",
    criteria: Object.values(SCORE_LEGENDS.evidence_sufficiency) as [
      string,
      string,
      string,
      string,
    ],
  },
});
