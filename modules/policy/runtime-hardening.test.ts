import { describe, expect, it } from "vitest";

import type { Direction, JudgmentAnswers } from "@/modules/judgment/contracts";
import { buildPolicyJudgment } from "@/tests/fixtures/policy/judgments";

import {
  POLICY_V1,
  createPolicyEngine,
  evaluatePosition,
  evaluateSprint,
} from "./policy";
import type { PositionPolicyInput } from "./types";

function positionInput(
  judgment: JudgmentAnswers,
  position: PositionPolicyInput["position"] = null,
): PositionPolicyInput {
  return {
    judgment,
    dataQuality: { valid: true, fresh: true },
    marketRisk: { index: 34, band: "LOW" },
    sizing: {
      valid: true,
      shares: 125,
      plannedLoss: 1_000,
      notional: 12_500,
    },
    position,
  };
}

function invalidJudgments(): Array<[string, JudgmentAnswers]> {
  const base = buildPolicyJudgment();
  return [
    [
      "forged direction",
      {
        ...base,
        direction: {
          ...base.direction,
          choice: "sideways" as Direction,
        },
      },
    ],
    [
      "selected choice mismatch",
      {
        ...base,
        direction: { ...base.direction, choice: "down" },
      },
    ],
    [
      "NaN probability",
      {
        ...base,
        direction: {
          ...base.direction,
          probabilities: { up: Number.NaN, flat: 0.2, down: 0.1 },
        },
      },
    ],
    [
      "probability sum",
      {
        ...base,
        direction: {
          ...base.direction,
          probabilities: { up: 0.7, flat: 0.3, down: 0.2 },
        },
      },
    ],
    [
      "out-of-range confidence",
      {
        ...base,
        direction: { ...base.direction, confidence: 1.01 },
      },
    ],
    [
      "out-of-range score",
      {
        ...base,
        setup_quality: { ...base.setup_quality, score: 3.01 },
      },
    ],
    [
      "score probability mismatch",
      {
        ...base,
        evidence_sufficiency: {
          ...base.evidence_sufficiency,
          probabilities: { "0": 0, "1": 0, "2": 1, "3": 0 },
        },
      },
    ],
    ["missing shape", null as unknown as JudgmentAnswers],
  ];
}

describe("policy configuration validation", () => {
  it.each([
    [
      "malformed version",
      () => createPolicyEngine({ ...POLICY_V1, version: "Policy V2" }),
    ],
    [
      "NaN threshold",
      () =>
        createPolicyEngine({
          ...POLICY_V1,
          version: "policy-v2",
          sprint: { ...POLICY_V1.sprint, selectedProbability: Number.NaN },
        }),
    ],
    [
      "probability outside domain",
      () =>
        createPolicyEngine({
          ...POLICY_V1,
          version: "policy-v2",
          positionEntry: { ...POLICY_V1.positionEntry, upProbability: 1.01 },
        }),
    ],
    [
      "score outside domain",
      () =>
        createPolicyEngine({
          ...POLICY_V1,
          version: "policy-v2",
          positionEntry: { ...POLICY_V1.positionEntry, setupScore: 3.01 },
        }),
    ],
    [
      "overlapping entry and hold hazard ranges",
      () =>
        createPolicyEngine({
          ...POLICY_V1,
          version: "policy-v2",
          positionEntry: {
            ...POLICY_V1.positionEntry,
            maximumDownsideScore: 2,
          },
        }),
    ],
    [
      "hazard exit inside hold range",
      () =>
        createPolicyEngine({
          ...POLICY_V1,
          version: "policy-v2",
          positionHold: { ...POLICY_V1.positionHold, hazardExitScore: 1.9 },
        }),
    ],
  ])("rejects %s", (_label, build) => {
    expect(build).toThrow("invalid policy configuration");
  });

  it("copies and freezes every validated section", () => {
    const policy = createPolicyEngine({ ...POLICY_V1, version: "policy-v2" });

    expect(policy.version).toBe("policy-v2");
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.positionEntry)).toBe(true);
    expect(Object.isFrozen(policy.positionHold)).toBe(true);
    expect(Object.isFrozen(policy.sprint)).toBe(true);
  });
});

describe("runtime judgment boundary", () => {
  it.each(invalidJudgments())(
    "returns WAIT for entry on %s",
    (_label, judgment) => {
      const decision = evaluatePosition(POLICY_V1, positionInput(judgment));

      expect(decision.action).toBe("WAIT");
      expect(decision.gates[0]).toMatchObject({
        id: "judgment_valid",
        status: "fail",
      });
      expect(decision.warnings).toContain("INVALID_JUDGMENT");
    },
  );

  it("returns PASS for Sprint without indexing a forged selected choice", () => {
    const judgment = invalidJudgments()[0]?.[1];
    if (!judgment) throw new Error("invalid judgment fixture missing");

    const decision = evaluateSprint(POLICY_V1, {
      judgment,
      dataQuality: { valid: true, fresh: true },
    });

    expect(decision.action).toBe("PASS");
    expect(decision.gates[0]).toMatchObject({
      id: "judgment_valid",
      status: "fail",
    });
  });

  it("counts an invalid open-position judgment as an eligible hold failure", () => {
    const judgment = invalidJudgments()[1]?.[1];
    if (!judgment) throw new Error("invalid judgment fixture missing");
    const open = {
      stopPrice: 92,
      completedSessionLow: 95,
      eligibleSessionsHeld: 5,
      horizonSessions: 20,
      consecutiveHoldFailures: 0,
    };
    const first = evaluatePosition(POLICY_V1, positionInput(judgment, open));
    const second = evaluatePosition(
      POLICY_V1,
      positionInput(judgment, { ...open, consecutiveHoldFailures: 1 }),
    );

    expect(first).toMatchObject({ action: "HOLD", consecutiveHoldFailures: 1 });
    expect(first.warnings).toEqual([
      "INVALID_JUDGMENT",
      "PROVISIONAL_HOLD_GATE_FAILURE",
    ]);
    expect(second).toMatchObject({
      action: "EXIT",
      exitReason: "two_consecutive_hold_failures",
      consecutiveHoldFailures: 2,
    });
  });

  it.each([
    ["stop", { completedSessionLow: 92 }, "stop"],
    ["horizon", { eligibleSessionsHeld: 20 }, "horizon"],
  ] as const)(
    "keeps %s precedence over an invalid judgment",
    (_label, override, exitReason) => {
      const judgment = invalidJudgments()[1]?.[1];
      if (!judgment) throw new Error("invalid judgment fixture missing");
      const decision = evaluatePosition(
        POLICY_V1,
        positionInput(judgment, {
          stopPrice: 92,
          completedSessionLow: 95,
          eligibleSessionsHeld: 5,
          horizonSessions: 20,
          consecutiveHoldFailures: 0,
          ...override,
        }),
      );

      expect(decision).toMatchObject({ action: "EXIT", exitReason });
      expect(decision.gates[0]).toMatchObject({
        id: "judgment_valid",
        status: "fail",
      });
    },
  );

  it("keeps invalidated-data exit precedence over an invalid judgment", () => {
    const judgment = invalidJudgments()[1]?.[1];
    if (!judgment) throw new Error("invalid judgment fixture missing");
    const input = positionInput(judgment, {
      stopPrice: 92,
      completedSessionLow: 95,
      eligibleSessionsHeld: 5,
      horizonSessions: 20,
      consecutiveHoldFailures: 0,
    });
    const decision = evaluatePosition(POLICY_V1, {
      ...input,
      dataQuality: { valid: false, fresh: true },
    });

    expect(decision).toMatchObject({
      action: "EXIT",
      exitReason: "data_invalidated",
    });
  });
});
