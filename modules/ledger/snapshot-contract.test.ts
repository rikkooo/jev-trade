import { describe, expect, it } from "vitest";

import { LedgerInvariantError } from "./errors";
import {
  MINIMUM_SNAPSHOT_HISTORY,
  validateSnapshotHistory,
  type SnapshotHistoryReference,
} from "./snapshot-contract";

function references(): SnapshotHistoryReference[] {
  const first = Date.UTC(2025, 11, 21);
  return Array.from({ length: MINIMUM_SNAPSHOT_HISTORY }, (_, ordinal) => {
    const sessionDate = new Date(first + ordinal * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return [
      {
        barId: `symbol-${ordinal}`,
        role: "symbol" as const,
        ordinal,
        symbol: "AAPL",
        sessionDate,
      },
      {
        barId: `benchmark-${ordinal}`,
        role: "benchmark" as const,
        ordinal,
        symbol: "SPY",
        sessionDate,
      },
    ];
  }).flat();
}

function validate(items: readonly SnapshotHistoryReference[]) {
  validateSnapshotHistory({
    symbol: "AAPL",
    benchmarkSymbol: "SPY",
    latestMarketSession: "2026-09-18",
    references: items,
  });
}

describe("snapshot history contract", () => {
  it("accepts two aligned 272-session series ending at the frozen session", () => {
    expect(() => validate(references())).not.toThrow();
  });

  it("rejects a wrong symbol, gap, misalignment, future bar, or short history", () => {
    const cases = [
      references().map((value) =>
        value.barId === "symbol-0" ? { ...value, symbol: "MSFT" } : value,
      ),
      references().filter((value) => value.barId !== "symbol-100"),
      references().map((value) =>
        value.barId === "benchmark-100"
          ? { ...value, sessionDate: "2026-01-01" }
          : value,
      ),
      references().map((value) =>
        value.barId === "symbol-271"
          ? { ...value, sessionDate: "2026-09-19" }
          : value,
      ),
      references().filter((value) => value.ordinal > 0),
    ];

    for (const invalid of cases) {
      expect(() => validate(invalid)).toThrow(LedgerInvariantError);
    }
  });
});
