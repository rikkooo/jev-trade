import { describe, expect, it } from "vitest";

import {
  applyAdverseExecution,
  createNextOpenFill,
  sizeLongPosition,
} from "./position-risk";
import { allocateCandidates } from "./ranking";

describe("position sizing", () => {
  it("implements AE3 exactly before execution assumptions", () => {
    const result = sizeLongPosition({
      entryPrice: 100,
      atr14: 4,
      equity: 100_000,
      cash: 100_000,
      aggregatePlannedLoss: 0,
      openPositionCount: 0,
    });

    expect(result).toMatchObject({
      valid: true,
      shares: 125,
      stopDistance: 8,
      stopPrice: 92,
      notional: 12_500,
      plannedLoss: 1_000,
      plannedLossBeforeExecution: 1_000,
      formulaVersion: "position-risk-v1",
    });
  });

  it.each([
    ["a sixth position", { openPositionCount: 5 }, "MAX_POSITIONS"],
    ["aggregate loss", { aggregatePlannedLoss: 5_000 }, "AGGREGATE_LOSS_LIMIT"],
    ["cash", { cash: 0 }, "INSUFFICIENT_CASH"],
    ["non-finite input", { atr14: Number.NaN }, "INVALID_INPUT"],
  ])("fails closed for %s", (_label, override, reason) => {
    expect(
      sizeLongPosition({
        entryPrice: 100,
        atr14: 4,
        equity: 100_000,
        cash: 100_000,
        aggregatePlannedLoss: 0,
        openPositionCount: 0,
        ...override,
      }),
    ).toMatchObject({ valid: false, reason });
  });

  it("lets the 20% notional cap bind and returns whole shares", () => {
    expect(
      sizeLongPosition({
        entryPrice: 100,
        atr14: 0.5,
        equity: 100_000,
        cash: 100_000,
        aggregatePlannedLoss: 0,
        openPositionCount: 0,
      }),
    ).toMatchObject({
      valid: true,
      shares: 200,
      notional: 20_000,
      plannedLoss: 800,
    });
  });

  it("reduces size to the remaining aggregate loss capacity", () => {
    expect(
      sizeLongPosition({
        entryPrice: 100,
        atr14: 4,
        equity: 100_000,
        cash: 100_000,
        aggregatePlannedLoss: 4_500,
        openPositionCount: 4,
      }),
    ).toMatchObject({ valid: true, shares: 62, plannedLoss: 496 });
  });
});

describe("next-open execution", () => {
  it("applies 10 bps adverse execution on each side", () => {
    expect(applyAdverseExecution(100, "entry")).toBeCloseTo(100.1, 10);
    expect(applyAdverseExecution(100, "exit")).toBeCloseTo(99.9, 10);
  });

  it("rejects a same-input-bar fill", () => {
    expect(
      createNextOpenFill({
        side: "entry",
        inputCutoffSession: "2026-09-18",
        executionSession: "2026-09-18",
        unadjustedOpen: 100,
        openAt: "2026-09-18T13:30:00.000Z",
        attestationReceivedAt: "2026-09-18T13:00:00.000Z",
      }),
    ).toEqual({ filled: false, reason: "SAME_OR_EARLIER_SESSION" });
  });

  it("requires an attestation strictly before entry open", () => {
    expect(
      createNextOpenFill({
        side: "entry",
        inputCutoffSession: "2026-09-18",
        executionSession: "2026-09-19",
        unadjustedOpen: 100,
        openAt: "2026-09-19T13:30:00.000Z",
        attestationReceivedAt: "2026-09-19T13:30:00.000Z",
      }),
    ).toEqual({
      filled: false,
      reason: "ATTESTATION_NOT_TIMELY",
      prospectiveStatus: "EXTERNALLY_UNVERIFIED",
    });
  });

  it("fills a timely entry only on a later session", () => {
    expect(
      createNextOpenFill({
        side: "entry",
        inputCutoffSession: "2026-09-18",
        executionSession: "2026-09-19",
        unadjustedOpen: 100,
        openAt: "2026-09-19T13:30:00.000Z",
        attestationReceivedAt: "2026-09-19T13:29:59.999Z",
      }),
    ).toMatchObject({
      filled: true,
      executionSession: "2026-09-19",
      fillPrice: 100.1,
      prospectiveStatus: "ATTESTED",
    });
  });

  it.each([
    ["non-canonical open", { openAt: "2026-09-19T13:30:00Z" }],
    ["offset open", { openAt: "2026-09-19T09:30:00.000-04:00" }],
    ["session/open mismatch", { openAt: "2026-09-20T13:30:00.000Z" }],
    ["malformed attestation", { attestationReceivedAt: "not-an-instant" }],
    [
      "non-canonical attestation",
      { attestationReceivedAt: "2026-09-19T13:00:00Z" },
    ],
  ])("rejects %s timestamps as invalid execution input", (_label, override) => {
    expect(
      createNextOpenFill({
        side: "entry",
        inputCutoffSession: "2026-09-18",
        executionSession: "2026-09-19",
        unadjustedOpen: 100,
        openAt: "2026-09-19T13:30:00.000Z",
        attestationReceivedAt: "2026-09-19T13:00:00.000Z",
        ...override,
      }),
    ).toEqual({ filled: false, reason: "INVALID_EXECUTION_INPUT" });
  });

  it("rejects a supplied malformed attestation on an exit", () => {
    expect(
      createNextOpenFill({
        side: "exit",
        inputCutoffSession: "2026-09-18",
        executionSession: "2026-09-19",
        unadjustedOpen: 100,
        openAt: "2026-09-19T13:30:00.000Z",
        attestationReceivedAt: "malformed",
      }),
    ).toEqual({ filled: false, reason: "INVALID_EXECUTION_INPUT" });
  });
});

describe("same-cutoff candidate allocation", () => {
  const candidates = [
    {
      symbol: "ZZZ",
      marketRiskIndex: 20,
      upProbability: 0.8,
      shares: 10,
      notional: 1_000,
      plannedLoss: 100,
    },
    {
      symbol: "AAA",
      marketRiskIndex: 10,
      upProbability: 0.7,
      shares: 10,
      notional: 1_000,
      plannedLoss: 100,
    },
    {
      symbol: "BBB",
      marketRiskIndex: 10,
      upProbability: 0.8,
      shares: 10,
      notional: 1_000,
      plannedLoss: 100,
    },
  ] as const;

  it("ranks risk asc, up probability desc, symbol asc independent of completion order", () => {
    const forward = allocateCandidates(candidates, {
      cash: 2_000,
      equity: 100_000,
      openPositionCount: 3,
      aggregatePlannedLoss: 0,
    });
    const reverse = allocateCandidates([...candidates].reverse(), {
      cash: 2_000,
      equity: 100_000,
      openPositionCount: 3,
      aggregatePlannedLoss: 0,
    });

    expect(forward).toEqual(reverse);
    expect(
      forward.map((result) => [
        result.rank,
        result.symbol,
        result.status,
        result.reason,
      ]),
    ).toEqual([
      [1, "BBB", "filled", undefined],
      [2, "AAA", "filled", undefined],
      [3, "ZZZ", "rejected", "MAX_POSITIONS"],
    ]);
  });

  it("fails closed for duplicated symbols and invalid capacity", () => {
    const duplicate = [candidates[0], { ...candidates[0], notional: 900 }];
    expect(
      allocateCandidates(duplicate, {
        cash: 10_000,
        equity: 100_000,
        openPositionCount: 0,
        aggregatePlannedLoss: 0,
      }).map((result) => result.reason),
    ).toEqual(["DUPLICATE_SYMBOL", "DUPLICATE_SYMBOL"]);

    expect(
      allocateCandidates([candidates[0]], {
        cash: Number.NaN,
        equity: 100_000,
        openPositionCount: 0,
        aggregatePlannedLoss: 0,
      })[0]?.reason,
    ).toBe("INVALID_CAPACITY");
  });
});
