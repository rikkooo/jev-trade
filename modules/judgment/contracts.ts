import type {
  CompactMarketState,
  MarketFeatures,
} from "@/modules/market/contracts";

export const REQUESTED_JEV_MODEL = "typesafe/jev-1.13" as const;
export const EXPECTED_RESOLVED_MODEL = "typesafe/jev-1.13-20260917" as const;
export const QUESTION_SET_VERSION = "jev-questions-v1" as const;
export const JUDGMENT_CONTRACT_VERSION = "jev-trade-judgment-v1" as const;
export const PROBABILITY_SUM_TOLERANCE = 1e-3;
export const SCORE_ROUNDING_TOLERANCE = 0.02;
export const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024;
export const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;

export const JUDGMENT_QUESTION_IDS = [
  "direction",
  "setup_quality",
  "downside_hazard",
  "evidence_sufficiency",
] as const;

export type JudgmentQuestionId = (typeof JUDGMENT_QUESTION_IDS)[number];
export type ScoreQuestionId = Exclude<JudgmentQuestionId, "direction">;
export type Direction = "up" | "flat" | "down";
export type StrategyMode = "position" | "sprint";
export type EvaluationMode = "scored" | "sandbox";

export interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Record<Direction, string>>;
}

export interface ScoreQuestion {
  readonly type: "score";
  readonly instructions: string;
  readonly criteria: readonly [string, string, string, string];
}

export interface JudgmentQuestions {
  readonly direction: ChoiceQuestion;
  readonly setup_quality: ScoreQuestion;
  readonly downside_hazard: ScoreQuestion;
  readonly evidence_sufficiency: ScoreQuestion;
}

export interface ApprovedJudgmentState {
  readonly schema_version: "jev-market-state-v1";
  readonly source_schema_version: CompactMarketState["schemaVersion"];
  readonly symbol: string;
  readonly benchmark_symbol: string;
  readonly strategy_mode: StrategyMode;
  readonly horizon_sessions: number;
  readonly cutoff_session: string;
  readonly outcome_definition: {
    readonly flat_band_percent: number;
    readonly boundary_values_are_flat: true;
  };
  readonly latest_adjusted_close: number;
  readonly features: MarketFeatures;
  readonly upcoming_known_events: CompactMarketState["upcomingKnownEvents"];
  readonly staleness: CompactMarketState["staleness"];
  readonly missing_data: CompactMarketState["missingData"];
}

export interface DecisionsWireRequest {
  readonly model: string;
  readonly state: ApprovedJudgmentState;
  readonly questions: JudgmentQuestions;
  readonly session_id?: string;
}

export interface JudgmentRequest {
  readonly contractVersion: typeof JUDGMENT_CONTRACT_VERSION;
  readonly questionSetVersion: typeof QUESTION_SET_VERSION;
  readonly evaluationMode: EvaluationMode;
  readonly wire: DecisionsWireRequest;
  readonly canonicalBody: string;
  readonly requestHash: string;
}

export interface BuildJudgmentRequestInput {
  readonly marketState: CompactMarketState;
  readonly strategyMode: StrategyMode;
  readonly horizonSessions: number;
  readonly evaluationMode: EvaluationMode;
  readonly flatBandPercent?: number;
  readonly requestedModel?: string;
  readonly sessionId?: string;
}

export interface ChoiceAnswer {
  readonly type: "choice";
  readonly choice: Direction;
  readonly probabilities: Readonly<Record<Direction, number>>;
  readonly confidence: number;
}

export type ScoreLevel = "0" | "1" | "2" | "3";

export interface ScoreAnswer {
  readonly type: "score";
  readonly score: number;
  readonly legend: Readonly<Record<ScoreLevel, string>>;
  readonly probabilities: Readonly<Record<ScoreLevel, number>>;
  readonly confidence: number;
}

export interface JudgmentAnswers {
  readonly direction: ChoiceAnswer;
  readonly setup_quality: ScoreAnswer;
  readonly downside_hazard: ScoreAnswer;
  readonly evidence_sufficiency: ScoreAnswer;
}

export interface JudgmentUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost?: number;
}

export interface ValidatedDecisionsResponse {
  readonly id?: string;
  readonly model: string;
  readonly provider?: string;
  readonly answers: JudgmentAnswers;
  readonly usage: JudgmentUsage;
}

export type JudgmentErrorCode =
  | "CONFIGURATION"
  | "CANCELED"
  | "INVALID_REQUEST"
  | "AUTHENTICATION"
  | "INSUFFICIENT_CREDITS"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "MODEL_DRIFT";

export interface JudgmentAttemptReceipt {
  readonly attempt: number;
  readonly code?: JudgmentErrorCode;
  readonly durationMs: number;
  readonly status?: number;
  readonly retryAfterMs?: number;
}

export interface JudgmentReceipt {
  readonly responseId?: string;
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly provider?: string;
  readonly usage: JudgmentUsage;
  readonly responseHash: string;
  readonly attempts: readonly JudgmentAttemptReceipt[];
}

export interface JudgmentEvaluation {
  readonly source: "openrouter" | "fixture";
  readonly liveJev: boolean;
  readonly publishable: boolean;
  readonly evaluationMode: EvaluationMode;
  readonly contractVersion: typeof JUDGMENT_CONTRACT_VERSION;
  readonly questionSetVersion: typeof QUESTION_SET_VERSION;
  readonly requestHash: string;
  readonly receipt: JudgmentReceipt;
  readonly answers: JudgmentAnswers;
}

export interface JevProvider {
  readonly id: string;
  evaluate(
    request: JudgmentRequest,
    options?: JevEvaluationOptions,
  ): Promise<JudgmentEvaluation>;
}

export interface JevEvaluationOptions {
  readonly signal?: AbortSignal;
}
