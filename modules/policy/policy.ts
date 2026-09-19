import type { Direction } from "@/modules/judgment/contracts";

import { isPolicyJudgmentValid } from "./judgment-validation";
import { classifyMarketRisk } from "./market-risk";

import type {
  PolicyConfiguration,
  PolicyGateTrace,
  PositionPolicyDecision,
  PositionPolicyInput,
  SprintPolicyDecision,
  SprintPolicyInput,
} from "./types";

export const POLICY_V1: PolicyConfiguration = createPolicyEngine({
  version: "policy-v1",
  positionEntry: Object.freeze({
    upProbability: 0.6,
    directionConfidence: 0.5,
    setupScore: 2,
    evidenceScore: 2,
    maximumDownsideScore: 1,
    scoreConfidence: 0.5,
  }),
  positionHold: Object.freeze({
    directionConfidence: 0.5,
    maximumDownsideScoreExclusive: 2,
    scoreConfidence: 0.5,
    downExitProbability: 0.55,
    hazardExitScore: 2,
  }),
  sprint: Object.freeze({
    selectedProbability: 0.55,
    directionConfidence: 0.5,
    evidenceScore: 2,
    evidenceConfidence: 0.5,
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configurationNumber(
  value: unknown,
  domainMaximum: 1 | 3,
  name: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > domainMaximum
  ) {
    throw new Error(
      `invalid policy configuration: ${name} must be finite in 0..${domainMaximum}`,
    );
  }
  return value;
}

export function createPolicyEngine(
  configuration: PolicyConfiguration,
): PolicyConfiguration {
  if (!isRecord(configuration)) {
    throw new Error("invalid policy configuration: object required");
  }
  if (
    typeof configuration.version !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(configuration.version)
  ) {
    throw new Error(
      "invalid policy configuration: version must be a stable lowercase identifier",
    );
  }
  if (
    !isRecord(configuration.positionEntry) ||
    !isRecord(configuration.positionHold) ||
    !isRecord(configuration.sprint)
  ) {
    throw new Error(
      "invalid policy configuration: all policy sections are required",
    );
  }
  const positionEntry = {
    upProbability: configurationNumber(
      configuration.positionEntry.upProbability,
      1,
      "positionEntry.upProbability",
    ),
    directionConfidence: configurationNumber(
      configuration.positionEntry.directionConfidence,
      1,
      "positionEntry.directionConfidence",
    ),
    setupScore: configurationNumber(
      configuration.positionEntry.setupScore,
      3,
      "positionEntry.setupScore",
    ),
    evidenceScore: configurationNumber(
      configuration.positionEntry.evidenceScore,
      3,
      "positionEntry.evidenceScore",
    ),
    maximumDownsideScore: configurationNumber(
      configuration.positionEntry.maximumDownsideScore,
      3,
      "positionEntry.maximumDownsideScore",
    ),
    scoreConfidence: configurationNumber(
      configuration.positionEntry.scoreConfidence,
      1,
      "positionEntry.scoreConfidence",
    ),
  };
  const positionHold = {
    directionConfidence: configurationNumber(
      configuration.positionHold.directionConfidence,
      1,
      "positionHold.directionConfidence",
    ),
    maximumDownsideScoreExclusive: configurationNumber(
      configuration.positionHold.maximumDownsideScoreExclusive,
      3,
      "positionHold.maximumDownsideScoreExclusive",
    ),
    scoreConfidence: configurationNumber(
      configuration.positionHold.scoreConfidence,
      1,
      "positionHold.scoreConfidence",
    ),
    downExitProbability: configurationNumber(
      configuration.positionHold.downExitProbability,
      1,
      "positionHold.downExitProbability",
    ),
    hazardExitScore: configurationNumber(
      configuration.positionHold.hazardExitScore,
      3,
      "positionHold.hazardExitScore",
    ),
  };
  const sprint = {
    selectedProbability: configurationNumber(
      configuration.sprint.selectedProbability,
      1,
      "sprint.selectedProbability",
    ),
    directionConfidence: configurationNumber(
      configuration.sprint.directionConfidence,
      1,
      "sprint.directionConfidence",
    ),
    evidenceScore: configurationNumber(
      configuration.sprint.evidenceScore,
      3,
      "sprint.evidenceScore",
    ),
    evidenceConfidence: configurationNumber(
      configuration.sprint.evidenceConfidence,
      1,
      "sprint.evidenceConfidence",
    ),
  };
  if (
    positionEntry.maximumDownsideScore >=
    positionHold.maximumDownsideScoreExclusive
  ) {
    throw new Error(
      "invalid policy configuration: entry downside maximum must be below the hold maximum",
    );
  }
  if (
    positionHold.hazardExitScore < positionHold.maximumDownsideScoreExclusive
  ) {
    throw new Error(
      "invalid policy configuration: hazard exit must not overlap the hold range",
    );
  }
  return Object.freeze({
    version: configuration.version,
    positionEntry: Object.freeze(positionEntry),
    positionHold: Object.freeze(positionHold),
    sprint: Object.freeze(sprint),
  });
}

function trace(
  gates: Omit<PolicyGateTrace, "order">[],
): readonly PolicyGateTrace[] {
  return gates.map((gate, index) => ({ ...gate, order: index + 1 }));
}

function gate(
  id: string,
  passes: boolean,
  actual: PolicyGateTrace["actual"],
  rule: string,
  reason: string,
): Omit<PolicyGateTrace, "order"> {
  return {
    id,
    status: passes ? "pass" : "fail",
    actual,
    rule,
    reason,
  };
}

function notApplicableGate(
  id: string,
  rule: string,
  reason = "Judgment validation failed before this gate could be evaluated.",
): Omit<PolicyGateTrace, "order"> {
  return {
    id,
    status: "not_applicable",
    actual: null,
    rule,
    reason,
  };
}

export function evaluatePosition(
  policy: PolicyConfiguration,
  input: PositionPolicyInput,
): PositionPolicyDecision {
  return input.position
    ? evaluateOpenPosition(policy, input)
    : evaluatePositionEntry(policy, input);
}

function evaluatePositionEntry(
  policy: PolicyConfiguration,
  input: PositionPolicyInput,
): PositionPolicyDecision {
  const config = policy.positionEntry;
  let marketRiskValid = false;
  try {
    marketRiskValid =
      classifyMarketRisk(input.marketRisk.index) === input.marketRisk.band;
  } catch {
    marketRiskValid = false;
  }
  const sizingValid =
    input.sizing.valid &&
    Number.isInteger(input.sizing.shares) &&
    (input.sizing.shares ?? 0) > 0 &&
    Number.isFinite(input.sizing.plannedLoss) &&
    (input.sizing.plannedLoss ?? 0) > 0 &&
    Number.isFinite(input.sizing.notional) &&
    (input.sizing.notional ?? 0) > 0;
  const judgmentValid = isPolicyJudgmentValid(input.judgment);
  if (!judgmentValid) {
    return {
      policyVersion: policy.version,
      action: "WAIT",
      consecutiveHoldFailures: 0,
      warnings: ["INVALID_JUDGMENT"],
      gates: trace([
        gate(
          "judgment_valid",
          false,
          false,
          "validated Jev judgment contract",
          "The judgment failed runtime shape or domain validation.",
        ),
        gate(
          "data_valid",
          input.dataQuality.valid,
          input.dataQuality.valid,
          "must be true",
          "Validated market data is required.",
        ),
        gate(
          "data_fresh",
          input.dataQuality.fresh,
          input.dataQuality.fresh,
          "must be true",
          "Fresh market data is required.",
        ),
        notApplicableGate("direction_up", "selected direction = up"),
        notApplicableGate("up_probability", `>= ${config.upProbability}`),
        notApplicableGate(
          "direction_confidence",
          `>= ${config.directionConfidence}`,
        ),
        notApplicableGate("setup_score", `>= ${config.setupScore}`),
        notApplicableGate("setup_confidence", `>= ${config.scoreConfidence}`),
        notApplicableGate("evidence_score", `>= ${config.evidenceScore}`),
        notApplicableGate(
          "evidence_confidence",
          `>= ${config.scoreConfidence}`,
        ),
        notApplicableGate(
          "downside_score",
          `<= ${config.maximumDownsideScore}`,
        ),
        notApplicableGate(
          "downside_confidence",
          `>= ${config.scoreConfidence}`,
        ),
        gate(
          "market_risk_below_high",
          marketRiskValid && input.marketRisk.band !== "HIGH",
          input.marketRisk.band,
          "finite 0–100 index in LOW or MEDIUM band",
          "HIGH or invalid market risk blocks entry independently of Jev conviction.",
        ),
        gate(
          "sizing_valid",
          sizingValid,
          input.sizing.valid,
          "valid positive whole-share size",
          input.sizing.reason ?? "A valid deterministic size is required.",
        ),
      ]),
    };
  }
  const judgment = input.judgment;
  const gates = trace([
    gate(
      "judgment_valid",
      true,
      true,
      "validated Jev judgment contract",
      "The judgment passed runtime shape and domain validation.",
    ),
    gate(
      "data_valid",
      input.dataQuality.valid,
      input.dataQuality.valid,
      "must be true",
      "Validated market data is required.",
    ),
    gate(
      "data_fresh",
      input.dataQuality.fresh,
      input.dataQuality.fresh,
      "must be true",
      "Fresh market data is required.",
    ),
    gate(
      "direction_up",
      judgment.direction.choice === "up",
      judgment.direction.choice,
      "selected direction = up",
      "The selected Jev direction must be up.",
    ),
    gate(
      "up_probability",
      judgment.direction.probabilities.up >= config.upProbability,
      judgment.direction.probabilities.up,
      `>= ${config.upProbability}`,
      "Up probability must meet the entry threshold.",
    ),
    gate(
      "direction_confidence",
      judgment.direction.confidence >= config.directionConfidence,
      judgment.direction.confidence,
      `>= ${config.directionConfidence}`,
      "Direction confidence must meet the entry threshold.",
    ),
    gate(
      "setup_score",
      judgment.setup_quality.score >= config.setupScore,
      judgment.setup_quality.score,
      `>= ${config.setupScore}`,
      "Setup quality must be adequate.",
    ),
    gate(
      "setup_confidence",
      judgment.setup_quality.confidence >= config.scoreConfidence,
      judgment.setup_quality.confidence,
      `>= ${config.scoreConfidence}`,
      "Setup confidence must meet the score-confidence threshold.",
    ),
    gate(
      "evidence_score",
      judgment.evidence_sufficiency.score >= config.evidenceScore,
      judgment.evidence_sufficiency.score,
      `>= ${config.evidenceScore}`,
      "Evidence must be adequate.",
    ),
    gate(
      "evidence_confidence",
      judgment.evidence_sufficiency.confidence >= config.scoreConfidence,
      judgment.evidence_sufficiency.confidence,
      `>= ${config.scoreConfidence}`,
      "Evidence confidence must meet the score-confidence threshold.",
    ),
    gate(
      "downside_score",
      judgment.downside_hazard.score <= config.maximumDownsideScore,
      judgment.downside_hazard.score,
      `<= ${config.maximumDownsideScore}`,
      "Downside hazard must stay within the entry limit.",
    ),
    gate(
      "downside_confidence",
      judgment.downside_hazard.confidence >= config.scoreConfidence,
      judgment.downside_hazard.confidence,
      `>= ${config.scoreConfidence}`,
      "Downside confidence must meet the score-confidence threshold.",
    ),
    gate(
      "market_risk_below_high",
      marketRiskValid && input.marketRisk.band !== "HIGH",
      input.marketRisk.band,
      "finite 0–100 index in LOW or MEDIUM band",
      "HIGH or invalid market risk blocks entry independently of Jev conviction.",
    ),
    gate(
      "sizing_valid",
      sizingValid,
      input.sizing.valid,
      "valid positive whole-share size",
      input.sizing.reason ?? "A valid deterministic size is required.",
    ),
  ]);
  const passes = gates.every((item) => item.status === "pass");

  return {
    policyVersion: policy.version,
    action: passes ? "ENTER" : "WAIT",
    gates,
    consecutiveHoldFailures: 0,
    warnings: [],
    ...(passes ? { sizing: input.sizing } : {}),
  };
}

function evaluateOpenPosition(
  policy: PolicyConfiguration,
  input: PositionPolicyInput,
): PositionPolicyDecision {
  const position = input.position;
  if (!position) throw new Error("open position state is required");
  const config = policy.positionHold;
  const positionStateValid =
    Number.isFinite(position.stopPrice) &&
    position.stopPrice > 0 &&
    Number.isFinite(position.completedSessionLow) &&
    position.completedSessionLow >= 0 &&
    Number.isInteger(position.eligibleSessionsHeld) &&
    position.eligibleSessionsHeld >= 0 &&
    Number.isInteger(position.horizonSessions) &&
    position.horizonSessions > 0 &&
    Number.isInteger(position.consecutiveHoldFailures) &&
    position.consecutiveHoldFailures >= 0;
  const stopTriggered = position.completedSessionLow <= position.stopPrice;
  const horizonReached =
    position.eligibleSessionsHeld >= position.horizonSessions;
  const dataInvalidated =
    !input.dataQuality.valid || !input.dataQuality.fresh || !positionStateValid;
  const judgmentValid = isPolicyJudgmentValid(input.judgment);
  if (!judgmentValid) {
    const gates = trace([
      gate(
        "judgment_valid",
        false,
        false,
        "validated Jev judgment contract",
        "The judgment failed runtime shape or domain validation.",
      ),
      gate(
        "stop_not_triggered",
        !stopTriggered,
        position.completedSessionLow,
        `> stop ${position.stopPrice}`,
        "A completed-session unadjusted low at or below the stop schedules exit.",
      ),
      gate(
        "horizon_not_reached",
        !horizonReached,
        position.eligibleSessionsHeld,
        `< ${position.horizonSessions} eligible sessions`,
        "The declared position horizon schedules exit.",
      ),
      gate(
        "data_valid",
        input.dataQuality.valid && positionStateValid,
        input.dataQuality.valid && positionStateValid,
        "market and position state must be valid",
        "Invalidated market or position data schedules exit.",
      ),
      gate(
        "data_fresh",
        input.dataQuality.fresh,
        input.dataQuality.fresh,
        "must be true",
        "Stale market data schedules exit.",
      ),
      notApplicableGate(
        "down_exit_not_triggered",
        `< ${config.downExitProbability} when selected direction is down`,
      ),
      notApplicableGate(
        "hazard_exit_not_triggered",
        `< ${config.hazardExitScore} or confidence < ${config.scoreConfidence}`,
      ),
      notApplicableGate("hold_direction", "up or flat"),
      notApplicableGate(
        "hold_direction_confidence",
        `>= ${config.directionConfidence}`,
      ),
      notApplicableGate(
        "hold_downside_score",
        `< ${config.maximumDownsideScoreExclusive}`,
      ),
      notApplicableGate(
        "hold_downside_confidence",
        `>= ${config.scoreConfidence}`,
      ),
    ]);
    const base = {
      policyVersion: policy.version,
      gates,
      warnings: ["INVALID_JUDGMENT"] as readonly string[],
    };
    if (stopTriggered) {
      return {
        ...base,
        action: "EXIT",
        exitReason: "stop",
        consecutiveHoldFailures: position.consecutiveHoldFailures,
      };
    }
    if (horizonReached) {
      return {
        ...base,
        action: "EXIT",
        exitReason: "horizon",
        consecutiveHoldFailures: position.consecutiveHoldFailures,
      };
    }
    if (dataInvalidated) {
      return {
        ...base,
        action: "EXIT",
        exitReason: "data_invalidated",
        consecutiveHoldFailures: position.consecutiveHoldFailures,
      };
    }
    const failures = position.consecutiveHoldFailures + 1;
    if (failures >= 2) {
      return {
        ...base,
        action: "EXIT",
        exitReason: "two_consecutive_hold_failures",
        consecutiveHoldFailures: failures,
      };
    }
    return {
      ...base,
      action: "HOLD",
      consecutiveHoldFailures: failures,
      warnings: ["INVALID_JUDGMENT", "PROVISIONAL_HOLD_GATE_FAILURE"],
    };
  }
  const judgment = input.judgment;
  const downExit =
    judgment.direction.choice === "down" &&
    judgment.direction.probabilities.down >= config.downExitProbability;
  const hazardExit =
    judgment.downside_hazard.score >= config.hazardExitScore &&
    judgment.downside_hazard.confidence >= config.scoreConfidence;
  const holdDirection =
    judgment.direction.choice === "up" || judgment.direction.choice === "flat";
  const holdGatesPass =
    holdDirection &&
    judgment.direction.confidence >= config.directionConfidence &&
    judgment.downside_hazard.score < config.maximumDownsideScoreExclusive &&
    judgment.downside_hazard.confidence >= config.scoreConfidence;
  const gates = trace([
    gate(
      "judgment_valid",
      true,
      true,
      "validated Jev judgment contract",
      "The judgment passed runtime shape and domain validation.",
    ),
    gate(
      "stop_not_triggered",
      !stopTriggered,
      position.completedSessionLow,
      `> stop ${position.stopPrice}`,
      "A completed-session unadjusted low at or below the stop schedules exit.",
    ),
    gate(
      "horizon_not_reached",
      !horizonReached,
      position.eligibleSessionsHeld,
      `< ${position.horizonSessions} eligible sessions`,
      "The declared position horizon schedules exit.",
    ),
    gate(
      "data_valid",
      input.dataQuality.valid && positionStateValid,
      input.dataQuality.valid && positionStateValid,
      "market and position state must be valid",
      "Invalidated market or position data schedules exit.",
    ),
    gate(
      "data_fresh",
      input.dataQuality.fresh,
      input.dataQuality.fresh,
      "must be true",
      "Stale market data schedules exit.",
    ),
    gate(
      "down_exit_not_triggered",
      !downExit,
      judgment.direction.probabilities.down,
      `< ${config.downExitProbability} when selected direction is down`,
      "A sufficiently probable selected down judgment schedules exit.",
    ),
    gate(
      "hazard_exit_not_triggered",
      !hazardExit,
      judgment.downside_hazard.score,
      `< ${config.hazardExitScore} or confidence < ${config.scoreConfidence}`,
      "A confident high downside hazard schedules exit.",
    ),
    gate(
      "hold_direction",
      holdDirection,
      judgment.direction.choice,
      "up or flat",
      "The hold gate accepts only up or flat.",
    ),
    gate(
      "hold_direction_confidence",
      judgment.direction.confidence >= config.directionConfidence,
      judgment.direction.confidence,
      `>= ${config.directionConfidence}`,
      "Direction confidence must meet the hold threshold.",
    ),
    gate(
      "hold_downside_score",
      judgment.downside_hazard.score < config.maximumDownsideScoreExclusive,
      judgment.downside_hazard.score,
      `< ${config.maximumDownsideScoreExclusive}`,
      "Downside hazard must remain below the hold limit.",
    ),
    gate(
      "hold_downside_confidence",
      judgment.downside_hazard.confidence >= config.scoreConfidence,
      judgment.downside_hazard.confidence,
      `>= ${config.scoreConfidence}`,
      "The downside score used by the hold gate must be sufficiently confident.",
    ),
  ]);

  const base = {
    policyVersion: policy.version,
    gates,
    warnings: [] as readonly string[],
  };
  if (stopTriggered) {
    return {
      ...base,
      action: "EXIT",
      exitReason: "stop",
      consecutiveHoldFailures: position.consecutiveHoldFailures,
    };
  }
  if (horizonReached) {
    return {
      ...base,
      action: "EXIT",
      exitReason: "horizon",
      consecutiveHoldFailures: position.consecutiveHoldFailures,
    };
  }
  if (dataInvalidated) {
    return {
      ...base,
      action: "EXIT",
      exitReason: "data_invalidated",
      consecutiveHoldFailures: position.consecutiveHoldFailures,
    };
  }
  if (downExit) {
    return {
      ...base,
      action: "EXIT",
      exitReason: "judgment_down",
      consecutiveHoldFailures: position.consecutiveHoldFailures,
    };
  }
  if (hazardExit) {
    return {
      ...base,
      action: "EXIT",
      exitReason: "downside_hazard",
      consecutiveHoldFailures: position.consecutiveHoldFailures,
    };
  }
  if (holdGatesPass) {
    return { ...base, action: "HOLD", consecutiveHoldFailures: 0 };
  }

  const failures = position.consecutiveHoldFailures + 1;
  if (failures >= 2) {
    return {
      ...base,
      action: "EXIT",
      exitReason: "two_consecutive_hold_failures",
      consecutiveHoldFailures: failures,
    };
  }
  return {
    ...base,
    action: "HOLD",
    consecutiveHoldFailures: failures,
    warnings: ["PROVISIONAL_HOLD_GATE_FAILURE"],
  };
}

export function evaluateSprint(
  policy: PolicyConfiguration,
  input: SprintPolicyInput,
): SprintPolicyDecision {
  const config = policy.sprint;
  const judgmentValid = isPolicyJudgmentValid(input.judgment);
  if (!judgmentValid) {
    return {
      policyVersion: policy.version,
      action: "PASS",
      gates: trace([
        gate(
          "judgment_valid",
          false,
          false,
          "validated Jev judgment contract",
          "The judgment failed runtime shape or domain validation.",
        ),
        gate(
          "data_valid",
          input.dataQuality.valid,
          input.dataQuality.valid,
          "must be true",
          "Validated market data is required.",
        ),
        gate(
          "data_fresh",
          input.dataQuality.fresh,
          input.dataQuality.fresh,
          "must be true",
          "Fresh market data is required.",
        ),
        notApplicableGate(
          "selected_probability",
          `>= ${config.selectedProbability}`,
        ),
        notApplicableGate(
          "direction_confidence",
          `>= ${config.directionConfidence}`,
        ),
        notApplicableGate("evidence_score", `>= ${config.evidenceScore}`),
        notApplicableGate(
          "evidence_confidence",
          `>= ${config.evidenceConfidence}`,
        ),
      ]),
    };
  }
  const judgment = input.judgment;
  const selected: Direction = judgment.direction.choice;
  const selectedProbability = judgment.direction.probabilities[selected];
  const gates = trace([
    gate(
      "judgment_valid",
      true,
      true,
      "validated Jev judgment contract",
      "The judgment passed runtime shape and domain validation.",
    ),
    gate(
      "data_valid",
      input.dataQuality.valid,
      input.dataQuality.valid,
      "must be true",
      "Validated market data is required.",
    ),
    gate(
      "data_fresh",
      input.dataQuality.fresh,
      input.dataQuality.fresh,
      "must be true",
      "Fresh market data is required.",
    ),
    gate(
      "selected_probability",
      selectedProbability >= config.selectedProbability,
      selectedProbability,
      `>= ${config.selectedProbability}`,
      "The selected class probability must meet the Sprint threshold.",
    ),
    gate(
      "direction_confidence",
      judgment.direction.confidence >= config.directionConfidence,
      judgment.direction.confidence,
      `>= ${config.directionConfidence}`,
      "Direction confidence must meet the Sprint threshold.",
    ),
    gate(
      "evidence_score",
      judgment.evidence_sufficiency.score >= config.evidenceScore,
      judgment.evidence_sufficiency.score,
      `>= ${config.evidenceScore}`,
      "Evidence must be adequate.",
    ),
    gate(
      "evidence_confidence",
      judgment.evidence_sufficiency.confidence >= config.evidenceConfidence,
      judgment.evidence_sufficiency.confidence,
      `>= ${config.evidenceConfidence}`,
      "Evidence confidence must meet the Sprint threshold.",
    ),
  ]);
  const passes = gates.every((item) => item.status === "pass");

  return {
    policyVersion: policy.version,
    action: passes
      ? (selected.toUpperCase() as "UP" | "FLAT" | "DOWN")
      : "PASS",
    gates,
  };
}
