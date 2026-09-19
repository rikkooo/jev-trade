import type { JudgmentAnswers } from "@/modules/judgment/contracts";
import { sanitizeJudgmentError } from "@/modules/judgment/errors";
import {
  POLICY_V1,
  evaluatePosition,
  type PolicyConfiguration,
  type PositionPolicyDecision,
  type PositionPolicyInput,
} from "@/modules/policy";

export interface PositionMonitoringResult {
  readonly judgmentStatus: "succeeded" | "failed";
  readonly decision: PositionPolicyDecision;
  readonly failure?: {
    readonly providerCode: string;
    readonly retryable: boolean;
  };
}

export async function monitorOpenPosition(input: {
  readonly policyInput: Omit<PositionPolicyInput, "judgment">;
  readonly evaluateJudgment: () => Promise<JudgmentAnswers>;
  readonly policy?: PolicyConfiguration;
}): Promise<PositionMonitoringResult> {
  if (input.policyInput.position === null) {
    throw new Error("position monitoring requires an open position");
  }
  try {
    const judgment = await input.evaluateJudgment();
    return {
      judgmentStatus: "succeeded",
      decision: evaluatePosition(input.policy ?? POLICY_V1, {
        ...input.policyInput,
        judgment,
      }),
    };
  } catch (error) {
    const safe = sanitizeJudgmentError(error);
    const decision = evaluatePosition(input.policy ?? POLICY_V1, {
      ...input.policyInput,
      // The policy validates at runtime and applies stop, horizon, and data
      // rules before treating the absent judgment as a hold-gate failure.
      judgment: null as unknown as JudgmentAnswers,
    });
    return {
      judgmentStatus: "failed",
      decision,
      failure: {
        providerCode: safe.code,
        retryable: safe.retryable,
      },
    };
  }
}
