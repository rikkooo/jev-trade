import type { ForecastMode } from "@/modules/ledger/types";
import { resolveDirectionOutcome } from "@/modules/policy/outcomes";

import { nthEligibleSession } from "./scheduler";

export interface OutcomeForecast {
  readonly id: string;
  readonly mode: ForecastMode;
  readonly horizonSessions: number;
  readonly cutoffSession: string;
  readonly cutoffAdjustedClose: number;
}

export interface OutcomeBar {
  readonly session: string;
  readonly adjustedClose: number;
  readonly sourceBarHash: string;
}

export interface LifecycleValuation {
  readonly type: "halt" | "delisting";
  readonly effectiveSession: string;
  readonly officialConsideration?: number;
  readonly lastDefensibleAdjustedValue?: number;
  readonly sourceHash: string;
}

export type IrrecoverableOutcomeReason =
  | "IRRECOVERABLE_MISSING_BAR"
  | "CORPORATE_ACTION_AMBIGUITY"
  | "PROVIDER_CORRECTION"
  | "JOB_FAILURE";

export type OutcomeResolution =
  | {
      readonly status: "pending";
      readonly targetSession: string;
      readonly reason:
        | "HORIZON_NOT_REACHED"
        | "PROVIDER_BAR_DELAYED"
        | "LIFECYCLE_VALUE_PENDING";
    }
  | {
      readonly status: "void";
      readonly targetSession: string;
      readonly reason: IrrecoverableOutcomeReason;
    }
  | {
      readonly status: "resolved";
      readonly targetSession: string;
      readonly realizedLabel: "up" | "flat" | "down";
      readonly adjustedReturn: number;
      readonly sourceHash: string;
      readonly valuationBasis:
        | "exact_horizon_close"
        | "official_delisting_consideration"
        | "last_defensible_value";
      readonly sensitivity: null | {
        readonly lowerBoundAdjustedReturn: -1;
        readonly upperBoundAdjustedReturn: number;
      };
    };

function validPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
}

function validOutcomeValue(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("resolution value must be non-negative and finite");
  }
}

function validateHash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("invalid source hash");
}

function adjustedReturn(value: number, cutoff: number): number {
  return (value - cutoff) / cutoff;
}

function resolved(input: {
  readonly targetSession: string;
  readonly value: number;
  readonly sourceHash: string;
  readonly basis: Extract<
    OutcomeResolution,
    { status: "resolved" }
  >["valuationBasis"];
  readonly forecast: OutcomeForecast;
  readonly sensitivity: boolean;
}): OutcomeResolution {
  validOutcomeValue(input.value);
  validateHash(input.sourceHash);
  const realizedReturn = adjustedReturn(
    input.value,
    input.forecast.cutoffAdjustedClose,
  );
  return {
    status: "resolved",
    targetSession: input.targetSession,
    realizedLabel: resolveDirectionOutcome(
      realizedReturn,
      input.forecast.mode,
      input.forecast.horizonSessions,
    ),
    adjustedReturn: realizedReturn,
    sourceHash: input.sourceHash,
    valuationBasis: input.basis,
    sensitivity: input.sensitivity
      ? {
          lowerBoundAdjustedReturn: -1,
          upperBoundAdjustedReturn: realizedReturn,
        }
      : null,
  };
}

export function resolveForecastAtHorizon(input: {
  readonly forecast: OutcomeForecast;
  readonly calendar: readonly string[];
  readonly asOfSession: string;
  readonly bars: readonly OutcomeBar[];
  readonly lifecycle?: LifecycleValuation;
  readonly irrecoverableReason?: IrrecoverableOutcomeReason;
}): OutcomeResolution {
  validPositive(input.forecast.cutoffAdjustedClose, "cutoff adjusted close");
  if (!input.calendar.includes(input.asOfSession)) {
    throw new Error("asOfSession is absent from the exchange calendar");
  }
  const targetSession = nthEligibleSession(
    input.forecast.cutoffSession,
    input.forecast.horizonSessions,
    input.calendar.map((session) => ({ session })),
  );
  if (input.asOfSession < targetSession) {
    return { status: "pending", targetSession, reason: "HORIZON_NOT_REACHED" };
  }
  const horizonBars = input.bars.filter((bar) => bar.session === targetSession);
  if (horizonBars.length > 1) throw new Error("duplicate horizon bar");
  const bar = horizonBars[0];
  if (bar !== undefined) {
    return resolved({
      targetSession,
      value: bar.adjustedClose,
      sourceHash: bar.sourceBarHash,
      basis: "exact_horizon_close",
      forecast: input.forecast,
      sensitivity: false,
    });
  }

  const lifecycle = input.lifecycle;
  if (
    lifecycle !== undefined &&
    lifecycle.effectiveSession > input.forecast.cutoffSession &&
    lifecycle.effectiveSession <= targetSession
  ) {
    if (
      lifecycle.type === "delisting" &&
      lifecycle.officialConsideration !== undefined
    ) {
      return resolved({
        targetSession,
        value: lifecycle.officialConsideration,
        sourceHash: lifecycle.sourceHash,
        basis: "official_delisting_consideration",
        forecast: input.forecast,
        sensitivity: false,
      });
    }
    if (lifecycle.lastDefensibleAdjustedValue !== undefined) {
      return resolved({
        targetSession,
        value: lifecycle.lastDefensibleAdjustedValue,
        sourceHash: lifecycle.sourceHash,
        basis: "last_defensible_value",
        forecast: input.forecast,
        sensitivity: true,
      });
    }
    if (input.irrecoverableReason !== undefined) {
      return {
        status: "void",
        targetSession,
        reason: input.irrecoverableReason,
      };
    }
    return {
      status: "pending",
      targetSession,
      reason: "LIFECYCLE_VALUE_PENDING",
    };
  }

  if (input.irrecoverableReason !== undefined) {
    return {
      status: "void",
      targetSession,
      reason: input.irrecoverableReason,
    };
  }
  return { status: "pending", targetSession, reason: "PROVIDER_BAR_DELAYED" };
}
