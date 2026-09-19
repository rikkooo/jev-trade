import { describe, expect, it } from "vitest";

import { buildPolicyJudgment } from "@/tests/fixtures/policy/judgments";

import {
  POLICY_V1,
  createPolicyEngine,
  evaluatePosition,
  evaluateSprint,
} from "./policy";
import type { PositionPolicyInput } from "./types";

function entryInput(
  overrides: Partial<PositionPolicyInput> = {},
): PositionPolicyInput {
  return {
    judgment: buildPolicyJudgment(),
    dataQuality: { valid: true, fresh: true },
    marketRisk: { index: 34, band: "LOW" },
    sizing: {
      valid: true,
      shares: 125,
      plannedLoss: 1_000,
      notional: 12_500,
    },
    position: null,
    ...overrides,
  };
}

describe("position policy v1 entry", () => {
  it("enters when every ordered gate passes", () => {
    const decision = evaluatePosition(POLICY_V1, entryInput());

    expect(decision.action).toBe("ENTER");
    expect(decision.policyVersion).toBe("policy-v1");
    expect(decision.gates.map((gate) => gate.id)).toEqual([
      "judgment_valid",
      "data_valid",
      "data_fresh",
      "direction_up",
      "up_probability",
      "direction_confidence",
      "setup_score",
      "setup_confidence",
      "evidence_score",
      "evidence_confidence",
      "downside_score",
      "downside_confidence",
      "market_risk_below_high",
      "sizing_valid",
    ]);
    expect(decision.gates.every((gate) => gate.status === "pass")).toBe(true);
  });

  it("implements AE2: strong conviction and HIGH market risk can coexist, but returns WAIT", () => {
    const decision = evaluatePosition(
      POLICY_V1,
      entryInput({ marketRisk: { index: 78, band: "HIGH" } }),
    );

    expect(decision.action).toBe("WAIT");
    expect(
      decision.gates.find((gate) => gate.id === "up_probability")?.status,
    ).toBe("pass");
    expect(
      decision.gates.find((gate) => gate.id === "market_risk_below_high")
        ?.status,
    ).toBe("fail");
  });

  it("fails closed when a supplied market-risk band disagrees with its index", () => {
    const decision = evaluatePosition(
      POLICY_V1,
      entryInput({ marketRisk: { index: 78, band: "LOW" } }),
    );

    expect(decision.action).toBe("WAIT");
    expect(
      decision.gates.find((gate) => gate.id === "market_risk_below_high")
        ?.status,
    ).toBe("fail");
  });

  it.each([
    [
      "up probability",
      buildPolicyJudgment({
        direction: { probabilities: { up: 0.5999, flat: 0.3, down: 0.1001 } },
      }),
    ],
    [
      "direction confidence",
      buildPolicyJudgment({ direction: { confidence: 0.4999 } }),
    ],
    ["setup score", buildPolicyJudgment({ setupQuality: { score: 1.9999 } })],
    [
      "setup confidence",
      buildPolicyJudgment({ setupQuality: { confidence: 0.4999 } }),
    ],
    [
      "evidence score",
      buildPolicyJudgment({ evidenceSufficiency: { score: 1.9999 } }),
    ],
    [
      "evidence confidence",
      buildPolicyJudgment({ evidenceSufficiency: { confidence: 0.4999 } }),
    ],
    [
      "downside score",
      buildPolicyJudgment({ downsideHazard: { score: 1.0001 } }),
    ],
    [
      "downside confidence",
      buildPolicyJudgment({ downsideHazard: { confidence: 0.4999 } }),
    ],
  ])("waits just outside the %s boundary", (_label, judgment) => {
    expect(evaluatePosition(POLICY_V1, entryInput({ judgment })).action).toBe(
      "WAIT",
    );
  });

  it("accepts every inclusive v1 entry threshold", () => {
    const judgment = buildPolicyJudgment({
      direction: {
        confidence: 0.5,
        probabilities: { up: 0.6, flat: 0.2, down: 0.2 },
      },
      setupQuality: { score: 2, confidence: 0.5 },
      downsideHazard: { score: 1, confidence: 0.5 },
      evidenceSufficiency: { score: 2, confidence: 0.5 },
    });

    expect(evaluatePosition(POLICY_V1, entryInput({ judgment })).action).toBe(
      "ENTER",
    );
  });

  it("keeps explicit policy versions isolated", () => {
    const v2 = createPolicyEngine({
      ...POLICY_V1,
      version: "position-policy-v2-test",
      positionEntry: { ...POLICY_V1.positionEntry, upProbability: 0.8 },
    });

    expect(evaluatePosition(POLICY_V1, entryInput()).action).toBe("ENTER");
    expect(evaluatePosition(v2, entryInput()).action).toBe("WAIT");
    expect(evaluatePosition(POLICY_V1, entryInput()).policyVersion).toBe(
      "policy-v1",
    );
  });
});

describe("position policy v1 monitoring", () => {
  const openPosition: NonNullable<PositionPolicyInput["position"]> = {
    stopPrice: 92,
    completedSessionLow: 95,
    eligibleSessionsHeld: 5,
    horizonSessions: 20,
    consecutiveHoldFailures: 0,
  };

  it("gives an exact-stop trigger precedence over horizon and judgment", () => {
    const decision = evaluatePosition(
      POLICY_V1,
      entryInput({
        position: {
          ...openPosition,
          completedSessionLow: 92,
          eligibleSessionsHeld: 20,
        },
      }),
    );

    expect(decision.action).toBe("EXIT");
    expect(decision.exitReason).toBe("stop");
    expect(decision.gates[1]).toMatchObject({
      id: "stop_not_triggered",
      status: "fail",
    });
    expect(decision.gates[2]).toMatchObject({
      id: "horizon_not_reached",
      status: "fail",
    });
  });

  it("exits at the exact horizon", () => {
    const decision = evaluatePosition(
      POLICY_V1,
      entryInput({
        position: { ...openPosition, eligibleSessionsHeld: 20 },
      }),
    );

    expect(decision.action).toBe("EXIT");
    expect(decision.exitReason).toBe("horizon");
  });

  it("records one provisional failure, exits on the second, and resets on a pass", () => {
    const failingJudgment = buildPolicyJudgment({
      direction: { choice: "flat", confidence: 0.49 },
    });
    const first = evaluatePosition(
      POLICY_V1,
      entryInput({ judgment: failingJudgment, position: openPosition }),
    );
    const second = evaluatePosition(
      POLICY_V1,
      entryInput({
        judgment: failingJudgment,
        position: { ...openPosition, consecutiveHoldFailures: 1 },
      }),
    );
    const reset = evaluatePosition(
      POLICY_V1,
      entryInput({
        position: { ...openPosition, consecutiveHoldFailures: 1 },
      }),
    );

    expect(first).toMatchObject({ action: "HOLD", consecutiveHoldFailures: 1 });
    expect(first.warnings).toContain("PROVISIONAL_HOLD_GATE_FAILURE");
    expect(second).toMatchObject({
      action: "EXIT",
      exitReason: "two_consecutive_hold_failures",
      consecutiveHoldFailures: 2,
    });
    expect(reset).toMatchObject({ action: "HOLD", consecutiveHoldFailures: 0 });
  });

  it.each([
    [
      "down",
      buildPolicyJudgment({
        direction: {
          choice: "down",
          probabilities: { up: 0.2, flat: 0.25, down: 0.55 },
        },
      }),
      "judgment_down",
    ],
    [
      "hazard",
      buildPolicyJudgment({ downsideHazard: { score: 2, confidence: 0.5 } }),
      "downside_hazard",
    ],
  ])("exits immediately on %s", (_label, judgment, exitReason) => {
    expect(
      evaluatePosition(
        POLICY_V1,
        entryInput({ judgment, position: openPosition }),
      ),
    ).toMatchObject({ action: "EXIT", exitReason });
  });

  it("exits immediately on invalidated data", () => {
    expect(
      evaluatePosition(
        POLICY_V1,
        entryInput({
          dataQuality: { valid: false, fresh: true },
          position: openPosition,
        }),
      ),
    ).toMatchObject({ action: "EXIT", exitReason: "data_invalidated" });
  });

  it("fails closed when persisted position state is malformed", () => {
    expect(
      evaluatePosition(
        POLICY_V1,
        entryInput({
          position: { ...openPosition, stopPrice: Number.NaN },
        }),
      ),
    ).toMatchObject({ action: "EXIT", exitReason: "data_invalidated" });
  });
});

describe("sprint policy v1", () => {
  it("emits the selected class at exact thresholds", () => {
    const judgment = buildPolicyJudgment({
      direction: {
        choice: "flat",
        probabilities: { up: 0.2, flat: 0.55, down: 0.25 },
        confidence: 0.5,
      },
      evidenceSufficiency: { score: 2, confidence: 0.5 },
    });

    expect(
      evaluateSprint(POLICY_V1, {
        judgment,
        dataQuality: { valid: true, fresh: true },
      }).action,
    ).toBe("FLAT");
  });

  it.each([
    [
      "probability",
      buildPolicyJudgment({
        direction: { probabilities: { up: 0.5499, flat: 0.3, down: 0.1501 } },
      }),
    ],
    [
      "direction confidence",
      buildPolicyJudgment({ direction: { confidence: 0.4999 } }),
    ],
    [
      "evidence",
      buildPolicyJudgment({ evidenceSufficiency: { score: 1.9999 } }),
    ],
    [
      "evidence confidence",
      buildPolicyJudgment({ evidenceSufficiency: { confidence: 0.4999 } }),
    ],
  ])("passes when %s misses", (_label, judgment) => {
    expect(
      evaluateSprint(POLICY_V1, {
        judgment,
        dataQuality: { valid: true, fresh: true },
      }).action,
    ).toBe("PASS");
  });
});
