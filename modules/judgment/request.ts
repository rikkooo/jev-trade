import type { MarketFeatures } from "@/modules/market/contracts";

import { canonicalHash, canonicalJson } from "./canonical";
import {
  DEFAULT_MAX_REQUEST_BYTES,
  JUDGMENT_CONTRACT_VERSION,
  QUESTION_SET_VERSION,
  REQUESTED_JEV_MODEL,
  type ApprovedJudgmentState,
  type BuildJudgmentRequestInput,
  type DecisionsWireRequest,
  type JudgmentRequest,
} from "./contracts";
import { JudgmentProviderError } from "./errors";
import { JUDGMENT_QUESTIONS_V1 } from "./questions/v1";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function assertExactKeys(value: object, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
}

function assertFiniteFeatures(features: MarketFeatures): void {
  const inspect = (value: unknown): void => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }
    if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === "object")
      Object.values(value).forEach(inspect);
  };
  assertExactKeys(features, [
    "returns",
    "trend",
    "movingAverageDistance",
    "rsi14",
    "atr14",
    "normalizedAtr14",
    "realizedVolatility20",
    "volatilityPercentile",
    "drawdown60",
    "volumeRegime",
    "latestGap",
    "largestAbsoluteGap20",
    "gapRiskPercentile",
    "relativeStrength",
    "benchmarkReturns",
    "benchmarkRegime",
    "sessionsToKnownEvent",
  ]);
  assertExactKeys(features.returns, ["1", "5", "20", "60", "252"]);
  assertExactKeys(features.trend, ["1", "5", "20", "60", "252"]);
  assertExactKeys(features.movingAverageDistance, ["20", "50", "200"]);
  assertExactKeys(features.relativeStrength, ["20", "60", "252"]);
  assertExactKeys(features.benchmarkReturns, ["20", "60", "252"]);
  inspect(features);
  if (
    Object.values(features.trend).some(
      (trend) => !["up", "flat", "down"].includes(trend),
    )
  ) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  if (!["risk_on", "mixed", "risk_off"].includes(features.benchmarkRegime)) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  if (
    features.sessionsToKnownEvent !== null &&
    (!Number.isInteger(features.sessionsToKnownEvent) ||
      features.sessionsToKnownEvent < 0)
  ) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
}

function cloneFeatures(features: MarketFeatures): MarketFeatures {
  return {
    returns: { ...features.returns },
    trend: { ...features.trend },
    movingAverageDistance: { ...features.movingAverageDistance },
    rsi14: features.rsi14,
    atr14: features.atr14,
    normalizedAtr14: features.normalizedAtr14,
    realizedVolatility20: features.realizedVolatility20,
    volatilityPercentile: features.volatilityPercentile,
    drawdown60: features.drawdown60,
    volumeRegime: features.volumeRegime,
    latestGap: features.latestGap,
    largestAbsoluteGap20: features.largestAbsoluteGap20,
    gapRiskPercentile: features.gapRiskPercentile,
    relativeStrength: { ...features.relativeStrength },
    benchmarkReturns: { ...features.benchmarkReturns },
    benchmarkRegime: features.benchmarkRegime,
    sessionsToKnownEvent: features.sessionsToKnownEvent,
  };
}

function expectedFlatBandPercent(
  strategyMode: BuildJudgmentRequestInput["strategyMode"],
  horizonSessions: number,
): number | undefined {
  if (strategyMode === "position" && horizonSessions === 20) return 2;
  if (strategyMode === "sprint" && horizonSessions === 1) return 0.5;
  if (strategyMode === "sprint" && horizonSessions === 5) return 1.5;
  return undefined;
}

function approvedState(
  input: BuildJudgmentRequestInput,
): ApprovedJudgmentState {
  const { marketState } = input;
  if (
    marketState.schemaVersion !== "market-state-v1" ||
    marketState.staleness !== "fresh" ||
    marketState.missingData.length !== 0 ||
    !/^[A-Z0-9._-]{1,32}$/.test(marketState.symbol) ||
    !/^[A-Z0-9._-]{1,32}$/.test(marketState.benchmarkSymbol) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(marketState.cutoffSession) ||
    !Number.isFinite(marketState.latestAdjustedClose) ||
    marketState.latestAdjustedClose <= 0
  ) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  assertFiniteFeatures(marketState.features);
  for (const event of marketState.upcomingKnownEvents) {
    if (
      !["earnings", "investor_day", "shareholder_meeting", "other"].includes(
        event.type,
      ) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(event.session) ||
      !Number.isInteger(event.sessionsAway) ||
      event.sessionsAway < 0
    ) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }
  }

  return {
    schema_version: "jev-market-state-v1",
    source_schema_version: marketState.schemaVersion,
    symbol: marketState.symbol,
    benchmark_symbol: marketState.benchmarkSymbol,
    strategy_mode: input.strategyMode,
    horizon_sessions: input.horizonSessions,
    cutoff_session: marketState.cutoffSession,
    outcome_definition: {
      flat_band_percent: input.flatBandPercent ?? 2,
      boundary_values_are_flat: true,
    },
    latest_adjusted_close: marketState.latestAdjustedClose,
    features: cloneFeatures(marketState.features),
    upcoming_known_events: marketState.upcomingKnownEvents.map((event) => ({
      type: event.type,
      session: event.session,
      sessionsAway: event.sessionsAway,
    })),
    staleness: marketState.staleness,
    missing_data: [],
  };
}

export function buildJudgmentRequest(
  input: BuildJudgmentRequestInput,
): JudgmentRequest {
  if (
    !Number.isInteger(input.horizonSessions) ||
    input.horizonSessions < 1 ||
    input.horizonSessions > 252 ||
    (input.strategyMode !== "position" && input.strategyMode !== "sprint") ||
    (input.evaluationMode !== "scored" && input.evaluationMode !== "sandbox")
  ) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  const expectedFlatBand = expectedFlatBandPercent(
    input.strategyMode,
    input.horizonSessions,
  );
  const flatBandPercent = input.flatBandPercent ?? expectedFlatBand;
  if (expectedFlatBand === undefined || flatBandPercent !== expectedFlatBand) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  const model = input.requestedModel ?? REQUESTED_JEV_MODEL;
  if (!model || model.length > 256 || /\s/.test(model)) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
  if (
    input.sessionId !== undefined &&
    (!input.sessionId ||
      input.sessionId.length > 256 ||
      /[\u0000-\u001f]/.test(input.sessionId))
  ) {
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }

  const wire: DecisionsWireRequest = {
    model,
    state: approvedState({ ...input, flatBandPercent }),
    questions: JUDGMENT_QUESTIONS_V1,
    ...(input.sessionId === undefined ? {} : { session_id: input.sessionId }),
  };
  const canonicalBody = canonicalJson(wire);
  if (
    new TextEncoder().encode(canonicalBody).byteLength >
    DEFAULT_MAX_REQUEST_BYTES
  ) {
    throw new JudgmentProviderError("PAYLOAD_TOO_LARGE", false);
  }

  return deepFreeze({
    contractVersion: JUDGMENT_CONTRACT_VERSION,
    questionSetVersion: QUESTION_SET_VERSION,
    evaluationMode: input.evaluationMode,
    wire,
    canonicalBody,
    requestHash: canonicalHash(wire),
  });
}

export function validateJudgmentRequest(request: JudgmentRequest): void {
  try {
    const requestKeys = [
      "contractVersion",
      "questionSetVersion",
      "evaluationMode",
      "wire",
      "canonicalBody",
      "requestHash",
    ];
    assertExactKeys(request, requestKeys);
    if (
      request.contractVersion !== JUDGMENT_CONTRACT_VERSION ||
      request.questionSetVersion !== QUESTION_SET_VERSION ||
      (request.evaluationMode !== "scored" &&
        request.evaluationMode !== "sandbox")
    ) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }
    assertExactKeys(
      request.wire,
      request.wire.session_id === undefined
        ? ["model", "state", "questions"]
        : ["model", "state", "questions", "session_id"],
    );
    if (
      canonicalJson(request.wire.questions) !==
      canonicalJson(JUDGMENT_QUESTIONS_V1)
    ) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }

    const state = request.wire.state;
    assertExactKeys(state, [
      "schema_version",
      "source_schema_version",
      "symbol",
      "benchmark_symbol",
      "strategy_mode",
      "horizon_sessions",
      "cutoff_session",
      "outcome_definition",
      "latest_adjusted_close",
      "features",
      "upcoming_known_events",
      "staleness",
      "missing_data",
    ]);
    assertExactKeys(state.outcome_definition, [
      "flat_band_percent",
      "boundary_values_are_flat",
    ]);
    if (
      state.schema_version !== "jev-market-state-v1" ||
      state.outcome_definition.boundary_values_are_flat !== true
    ) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }
    const rebuiltState = approvedState({
      marketState: {
        schemaVersion: state.source_schema_version,
        symbol: state.symbol,
        benchmarkSymbol: state.benchmark_symbol,
        cutoffSession: state.cutoff_session,
        latestAdjustedClose: state.latest_adjusted_close,
        features: state.features,
        upcomingKnownEvents: state.upcoming_known_events,
        staleness: state.staleness,
        missingData: state.missing_data,
      },
      strategyMode: state.strategy_mode,
      horizonSessions: state.horizon_sessions,
      evaluationMode: request.evaluationMode,
      flatBandPercent: state.outcome_definition.flat_band_percent,
      requestedModel: request.wire.model,
      sessionId: request.wire.session_id,
    });
    if (canonicalJson(state) !== canonicalJson(rebuiltState)) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }

    const rebuilt = buildJudgmentRequest({
      marketState: {
        schemaVersion: state.source_schema_version,
        symbol: state.symbol,
        benchmarkSymbol: state.benchmark_symbol,
        cutoffSession: state.cutoff_session,
        latestAdjustedClose: state.latest_adjusted_close,
        features: state.features,
        upcomingKnownEvents: state.upcoming_known_events,
        staleness: state.staleness,
        missingData: state.missing_data,
      },
      strategyMode: state.strategy_mode,
      horizonSessions: state.horizon_sessions,
      evaluationMode: request.evaluationMode,
      flatBandPercent: state.outcome_definition.flat_band_percent,
      requestedModel: request.wire.model,
      sessionId: request.wire.session_id,
    });
    if (
      request.canonicalBody !== rebuilt.canonicalBody ||
      request.requestHash !== rebuilt.requestHash
    ) {
      throw new JudgmentProviderError("INVALID_REQUEST", false);
    }
  } catch (error) {
    if (error instanceof JudgmentProviderError) throw error;
    throw new JudgmentProviderError("INVALID_REQUEST", false);
  }
}
