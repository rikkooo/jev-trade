export const POSITION_RISK_VERSION = "position-risk-v1" as const;
export const DEFAULT_EQUITY = 100_000;
export const POSITION_RISK_FRACTION = 0.01;
export const MAX_NOTIONAL_FRACTION = 0.2;
export const MAX_AGGREGATE_LOSS_FRACTION = 0.05;
export const MAX_OPEN_POSITIONS = 5;
export const EXECUTION_BPS = 10;

export type InvalidSizingReason =
  | "INVALID_INPUT"
  | "MAX_POSITIONS"
  | "AGGREGATE_LOSS_LIMIT"
  | "INSUFFICIENT_CASH"
  | "STOP_OUTSIDE_DOMAIN"
  | "ZERO_WHOLE_SHARES";

export interface PositionSizingInput {
  readonly entryPrice: number;
  readonly atr14: number;
  readonly equity?: number;
  readonly cash: number;
  readonly aggregatePlannedLoss: number;
  readonly openPositionCount: number;
}

export type PositionSizingResult =
  | {
      readonly valid: true;
      readonly shares: number;
      readonly entryPrice: number;
      readonly stopDistance: number;
      readonly stopPrice: number;
      readonly notional: number;
      readonly plannedLoss: number;
      readonly capitalAtRisk: number;
      readonly plannedLossBeforeExecution: number;
      readonly maximumPlannedPortfolioLoss: number;
      readonly formulaVersion: typeof POSITION_RISK_VERSION;
      readonly executionAssumptions: "excluded";
    }
  | {
      readonly valid: false;
      readonly reason: InvalidSizingReason;
      readonly formulaVersion: typeof POSITION_RISK_VERSION;
    };

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function sizeLongPosition(
  input: PositionSizingInput,
): PositionSizingResult {
  const equity = input.equity ?? DEFAULT_EQUITY;
  const numeric = [
    input.entryPrice,
    input.atr14,
    equity,
    input.cash,
    input.aggregatePlannedLoss,
    input.openPositionCount,
  ];
  if (
    !numeric.every(Number.isFinite) ||
    input.entryPrice <= 0 ||
    input.atr14 < 0 ||
    equity <= 0 ||
    input.cash < 0 ||
    input.aggregatePlannedLoss < 0 ||
    !Number.isInteger(input.openPositionCount) ||
    input.openPositionCount < 0
  ) {
    return {
      valid: false,
      reason: "INVALID_INPUT",
      formulaVersion: POSITION_RISK_VERSION,
    };
  }
  if (input.openPositionCount >= MAX_OPEN_POSITIONS) {
    return {
      valid: false,
      reason: "MAX_POSITIONS",
      formulaVersion: POSITION_RISK_VERSION,
    };
  }

  const maximumPlannedPortfolioLoss = equity * MAX_AGGREGATE_LOSS_FRACTION;
  const remainingAggregateRisk =
    maximumPlannedPortfolioLoss - input.aggregatePlannedLoss;
  if (remainingAggregateRisk <= 0) {
    return {
      valid: false,
      reason: "AGGREGATE_LOSS_LIMIT",
      formulaVersion: POSITION_RISK_VERSION,
    };
  }
  if (input.cash < input.entryPrice) {
    return {
      valid: false,
      reason: "INSUFFICIENT_CASH",
      formulaVersion: POSITION_RISK_VERSION,
    };
  }

  const stopDistance = Math.max(2 * input.atr14, 0.04 * input.entryPrice);
  const stopPrice = input.entryPrice - stopDistance;
  if (stopDistance <= 0 || stopPrice <= 0) {
    return {
      valid: false,
      reason: "STOP_OUTSIDE_DOMAIN",
      formulaVersion: POSITION_RISK_VERSION,
    };
  }

  const perTradeRiskBudget = equity * POSITION_RISK_FRACTION;
  const notionalBudget = equity * MAX_NOTIONAL_FRACTION;
  const shares = Math.floor(
    Math.min(
      perTradeRiskBudget / stopDistance,
      remainingAggregateRisk / stopDistance,
      notionalBudget / input.entryPrice,
      input.cash / input.entryPrice,
    ),
  );
  if (shares < 1) {
    return {
      valid: false,
      reason: "ZERO_WHOLE_SHARES",
      formulaVersion: POSITION_RISK_VERSION,
    };
  }

  const plannedLoss = round(shares * stopDistance, 2);
  return {
    valid: true,
    shares,
    entryPrice: input.entryPrice,
    stopDistance: round(stopDistance, 8),
    stopPrice: round(stopPrice, 8),
    notional: round(shares * input.entryPrice, 2),
    plannedLoss,
    capitalAtRisk: plannedLoss,
    plannedLossBeforeExecution: plannedLoss,
    maximumPlannedPortfolioLoss: round(maximumPlannedPortfolioLoss, 2),
    formulaVersion: POSITION_RISK_VERSION,
    executionAssumptions: "excluded",
  };
}

export type ExecutionSide = "entry" | "exit";

export function applyAdverseExecution(
  unadjustedOpen: number,
  side: ExecutionSide,
): number {
  if (!Number.isFinite(unadjustedOpen) || unadjustedOpen <= 0) {
    throw new Error("invalid unadjusted executable open");
  }
  const multiplier =
    side === "entry" ? 1 + EXECUTION_BPS / 10_000 : 1 - EXECUTION_BPS / 10_000;
  return round(unadjustedOpen * multiplier, 8);
}

export interface NextOpenFillInput {
  readonly side: ExecutionSide;
  readonly inputCutoffSession: string;
  readonly executionSession: string;
  readonly unadjustedOpen: number;
  readonly openAt: string;
  readonly attestationReceivedAt?: string;
}

export type NextOpenFillResult =
  | {
      readonly filled: true;
      readonly side: ExecutionSide;
      readonly executionSession: string;
      readonly unadjustedOpen: number;
      readonly fillPrice: number;
      readonly executionBps: typeof EXECUTION_BPS;
      readonly prospectiveStatus?: "ATTESTED";
    }
  | {
      readonly filled: false;
      readonly reason:
        | "INVALID_EXECUTION_INPUT"
        | "SAME_OR_EARLIER_SESSION"
        | "ATTESTATION_NOT_TIMELY";
      readonly prospectiveStatus?: "EXTERNALLY_UNVERIFIED";
    };

export function createNextOpenFill(
  input: NextOpenFillInput,
): NextOpenFillResult {
  const openAt = parseCanonicalIsoInstant(input.openAt);
  const attestationReceivedAt =
    input.attestationReceivedAt === undefined
      ? null
      : parseCanonicalIsoInstant(input.attestationReceivedAt);
  if (
    !isIsoSession(input.inputCutoffSession) ||
    !isIsoSession(input.executionSession) ||
    !Number.isFinite(input.unadjustedOpen) ||
    input.unadjustedOpen <= 0 ||
    openAt === null ||
    input.openAt.slice(0, 10) !== input.executionSession ||
    (input.attestationReceivedAt !== undefined &&
      attestationReceivedAt === null)
  ) {
    return { filled: false, reason: "INVALID_EXECUTION_INPUT" };
  }
  if (input.executionSession <= input.inputCutoffSession) {
    return { filled: false, reason: "SAME_OR_EARLIER_SESSION" };
  }
  if (input.side === "entry") {
    if (attestationReceivedAt === null || attestationReceivedAt >= openAt) {
      return {
        filled: false,
        reason: "ATTESTATION_NOT_TIMELY",
        prospectiveStatus: "EXTERNALLY_UNVERIFIED",
      };
    }
  }

  return {
    filled: true,
    side: input.side,
    executionSession: input.executionSession,
    unadjustedOpen: input.unadjustedOpen,
    fillPrice: applyAdverseExecution(input.unadjustedOpen, input.side),
    executionBps: EXECUTION_BPS,
    ...(input.side === "entry"
      ? { prospectiveStatus: "ATTESTED" as const }
      : {}),
  };
}

function parseCanonicalIsoInstant(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString() === value ? parsed : null;
}

function isIsoSession(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
