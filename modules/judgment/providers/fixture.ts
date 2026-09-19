import {
  JUDGMENT_CONTRACT_VERSION,
  QUESTION_SET_VERSION,
  type JevEvaluationOptions,
  type JevProvider,
  type JudgmentEvaluation,
  type JudgmentRequest,
} from "../contracts";
import { canonicalJson, sha256Text } from "../canonical";
import { JudgmentProviderError } from "../errors";
import { SCORE_LEGENDS } from "../questions/v1";
import { validateJudgmentRequest } from "../request";
import { validateDecisionsResponse } from "../validation";

const FIXTURE_RESPONSE = {
  id: "fixture-judgment-v1",
  model: "fixture/jev-contract-v1",
  provider: "Jev Trade deterministic fixture",
  answers: {
    direction: {
      type: "choice",
      choice: "up",
      probabilities: { up: 0.62, flat: 0.23, down: 0.15 },
      confidence: 0.47,
    },
    setup_quality: {
      type: "score",
      score: 2.1,
      legend: SCORE_LEGENDS.setup_quality,
      probabilities: { 0: 0.05, 1: 0.15, 2: 0.45, 3: 0.35 },
      confidence: 0.42,
    },
    downside_hazard: {
      type: "score",
      score: 1.1,
      legend: SCORE_LEGENDS.downside_hazard,
      probabilities: { 0: 0.25, 1: 0.45, 2: 0.25, 3: 0.05 },
      confidence: 0.36,
    },
    evidence_sufficiency: {
      type: "score",
      score: 2.1,
      legend: SCORE_LEGENDS.evidence_sufficiency,
      probabilities: { 0: 0.05, 1: 0.1, 2: 0.55, 3: 0.3 },
      confidence: 0.44,
    },
  },
  usage: { input_tokens: 0, output_tokens: 0, cost: 0 },
} as const;

export class FixtureJevProvider implements JevProvider {
  readonly id = "fixture";

  async evaluate(
    request: JudgmentRequest,
    options: JevEvaluationOptions = {},
  ): Promise<JudgmentEvaluation> {
    if (options.signal?.aborted) {
      throw new JudgmentProviderError("CANCELED", false);
    }
    validateJudgmentRequest(request);
    if (request.evaluationMode !== "sandbox") {
      throw new JudgmentProviderError("CONFIGURATION", false);
    }
    const response = validateDecisionsResponse(FIXTURE_RESPONSE, {});
    return Object.freeze({
      source: "fixture",
      liveJev: false,
      publishable: false,
      evaluationMode: request.evaluationMode,
      contractVersion: JUDGMENT_CONTRACT_VERSION,
      questionSetVersion: QUESTION_SET_VERSION,
      requestHash: request.requestHash,
      receipt: Object.freeze({
        responseId: response.id,
        requestedModel: request.wire.model,
        resolvedModel: response.model,
        provider: response.provider,
        usage: response.usage,
        responseHash: sha256Text(canonicalJson(FIXTURE_RESPONSE)),
        attempts: Object.freeze([
          Object.freeze({ attempt: 1, durationMs: 0, status: 200 }),
        ]),
      }),
      answers: response.answers,
    });
  }
}
