import {
  MAX_AGGREGATE_LOSS_FRACTION,
  MAX_NOTIONAL_FRACTION,
  MAX_OPEN_POSITIONS,
} from "./position-risk";

export interface PositionCandidate {
  readonly symbol: string;
  readonly marketRiskIndex: number;
  readonly upProbability: number;
  readonly shares: number;
  readonly notional: number;
  readonly plannedLoss: number;
}

export interface CandidateCapacity {
  readonly cash: number;
  readonly equity: number;
  readonly openPositionCount: number;
  readonly aggregatePlannedLoss: number;
}

export type CandidateRejectionReason =
  | "INVALID_CANDIDATE"
  | "INVALID_CAPACITY"
  | "DUPLICATE_SYMBOL"
  | "MAX_POSITIONS"
  | "INSUFFICIENT_CASH"
  | "PER_POSITION_NOTIONAL_LIMIT"
  | "AGGREGATE_LOSS_LIMIT";

export interface CandidateAllocation {
  readonly rank: number;
  readonly symbol: string;
  readonly status: "filled" | "rejected";
  readonly reason?: CandidateRejectionReason;
  readonly shares: number;
  readonly notional: number;
  readonly plannedLoss: number;
}

function compareCandidates(a: PositionCandidate, b: PositionCandidate): number {
  const aRisk = Number.isFinite(a.marketRiskIndex)
    ? a.marketRiskIndex
    : Number.POSITIVE_INFINITY;
  const bRisk = Number.isFinite(b.marketRiskIndex)
    ? b.marketRiskIndex
    : Number.POSITIVE_INFINITY;
  if (aRisk !== bRisk) {
    return aRisk - bRisk;
  }
  const aProbability = Number.isFinite(a.upProbability)
    ? a.upProbability
    : Number.NEGATIVE_INFINITY;
  const bProbability = Number.isFinite(b.upProbability)
    ? b.upProbability
    : Number.NEGATIVE_INFINITY;
  if (aProbability !== bProbability) {
    return bProbability - aProbability;
  }
  if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
  const aSignature = `${a.shares}:${a.notional}:${a.plannedLoss}`;
  const bSignature = `${b.shares}:${b.notional}:${b.plannedLoss}`;
  return aSignature < bSignature ? -1 : aSignature > bSignature ? 1 : 0;
}

function invalid(candidate: PositionCandidate): boolean {
  return (
    !candidate.symbol.trim() ||
    ![
      candidate.marketRiskIndex,
      candidate.upProbability,
      candidate.shares,
      candidate.notional,
      candidate.plannedLoss,
    ].every(Number.isFinite) ||
    candidate.marketRiskIndex < 0 ||
    candidate.marketRiskIndex > 100 ||
    candidate.upProbability < 0 ||
    candidate.upProbability > 1 ||
    !Number.isInteger(candidate.shares) ||
    candidate.shares <= 0 ||
    candidate.notional <= 0 ||
    candidate.plannedLoss <= 0
  );
}

export function allocateCandidates(
  candidates: readonly PositionCandidate[],
  capacity: CandidateCapacity,
): readonly CandidateAllocation[] {
  const ranked = [...candidates].sort(compareCandidates);
  let cash = capacity.cash;
  let positionCount = capacity.openPositionCount;
  let aggregateLoss = capacity.aggregatePlannedLoss;
  const symbolCounts = new Map<string, number>();
  for (const candidate of ranked) {
    symbolCounts.set(
      candidate.symbol,
      (symbolCounts.get(candidate.symbol) ?? 0) + 1,
    );
  }
  const capacityValid =
    [capacity.cash, capacity.equity, capacity.aggregatePlannedLoss].every(
      Number.isFinite,
    ) &&
    capacity.cash >= 0 &&
    capacity.equity > 0 &&
    capacity.aggregatePlannedLoss >= 0 &&
    Number.isInteger(capacity.openPositionCount) &&
    capacity.openPositionCount >= 0;

  return ranked.map((candidate, index) => {
    let reason: CandidateRejectionReason | undefined;
    if (!capacityValid) reason = "INVALID_CAPACITY";
    else if (invalid(candidate)) reason = "INVALID_CANDIDATE";
    else if ((symbolCounts.get(candidate.symbol) ?? 0) > 1)
      reason = "DUPLICATE_SYMBOL";
    else if (positionCount >= MAX_OPEN_POSITIONS) reason = "MAX_POSITIONS";
    else if (candidate.notional > capacity.equity * MAX_NOTIONAL_FRACTION)
      reason = "PER_POSITION_NOTIONAL_LIMIT";
    else if (candidate.notional > cash) reason = "INSUFFICIENT_CASH";
    else if (
      aggregateLoss + candidate.plannedLoss >
      capacity.equity * MAX_AGGREGATE_LOSS_FRACTION
    )
      reason = "AGGREGATE_LOSS_LIMIT";

    const result: CandidateAllocation = {
      rank: index + 1,
      symbol: candidate.symbol,
      status: reason ? "rejected" : "filled",
      ...(reason ? { reason } : {}),
      shares: candidate.shares,
      notional: candidate.notional,
      plannedLoss: candidate.plannedLoss,
    };
    if (!reason) {
      cash -= candidate.notional;
      positionCount += 1;
      aggregateLoss += candidate.plannedLoss;
    }
    return result;
  });
}
