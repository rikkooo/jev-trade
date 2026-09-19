import type { JudgmentAnswers } from "@/modules/judgment/contracts";
import type { MarketRiskBand } from "./market-risk";

export type GateStatus = "pass" | "fail" | "not_applicable";

export interface PolicyGateTrace {
  readonly order: number;
  readonly id: string;
  readonly status: GateStatus;
  readonly actual: string | number | boolean | null;
  readonly rule: string;
  readonly reason: string;
}

export interface DataQualityGate {
  readonly valid: boolean;
  readonly fresh: boolean;
}

export interface SizingGate {
  readonly valid: boolean;
  readonly shares?: number;
  readonly plannedLoss?: number;
  readonly notional?: number;
  readonly reason?: string;
}

export interface OpenPositionPolicyState {
  readonly stopPrice: number;
  readonly completedSessionLow: number;
  readonly eligibleSessionsHeld: number;
  readonly horizonSessions: number;
  readonly consecutiveHoldFailures: number;
}

export interface PositionPolicyInput {
  readonly judgment: JudgmentAnswers;
  readonly dataQuality: DataQualityGate;
  readonly marketRisk: {
    readonly index: number;
    readonly band: MarketRiskBand;
  };
  readonly sizing: SizingGate;
  readonly position: OpenPositionPolicyState | null;
}

export interface SprintPolicyInput {
  readonly judgment: JudgmentAnswers;
  readonly dataQuality: DataQualityGate;
}

export type PositionAction = "ENTER" | "HOLD" | "EXIT" | "WAIT";
export type SprintAction = "UP" | "FLAT" | "DOWN" | "PASS";
export type PositionExitReason =
  | "stop"
  | "horizon"
  | "data_invalidated"
  | "judgment_down"
  | "downside_hazard"
  | "two_consecutive_hold_failures";

export interface PositionPolicyDecision {
  readonly policyVersion: string;
  readonly action: PositionAction;
  readonly gates: readonly PolicyGateTrace[];
  readonly consecutiveHoldFailures: number;
  readonly exitReason?: PositionExitReason;
  readonly warnings: readonly string[];
  readonly sizing?: SizingGate;
}

export interface SprintPolicyDecision {
  readonly policyVersion: string;
  readonly action: SprintAction;
  readonly gates: readonly PolicyGateTrace[];
}

export interface PolicyConfiguration {
  readonly version: string;
  readonly positionEntry: {
    readonly upProbability: number;
    readonly directionConfidence: number;
    readonly setupScore: number;
    readonly evidenceScore: number;
    readonly maximumDownsideScore: number;
    readonly scoreConfidence: number;
  };
  readonly positionHold: {
    readonly directionConfidence: number;
    readonly maximumDownsideScoreExclusive: number;
    readonly scoreConfidence: number;
    readonly downExitProbability: number;
    readonly hazardExitScore: number;
  };
  readonly sprint: {
    readonly selectedProbability: number;
    readonly directionConfidence: number;
    readonly evidenceScore: number;
    readonly evidenceConfidence: number;
  };
}
