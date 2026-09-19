import { LedgerInvariantError } from "./errors";

export const MINIMUM_SNAPSHOT_HISTORY = 272 as const;

export interface SnapshotHistoryReference {
  readonly barId: string;
  readonly role: "symbol" | "benchmark";
  readonly ordinal: number;
  readonly symbol: string;
  readonly sessionDate: string;
}

export function validateSnapshotHistory(input: {
  readonly symbol: string;
  readonly benchmarkSymbol: string;
  readonly latestMarketSession: string;
  readonly references: readonly SnapshotHistoryReference[];
}): void {
  const byRole = {
    symbol: input.references.filter((reference) => reference.role === "symbol"),
    benchmark: input.references.filter(
      (reference) => reference.role === "benchmark",
    ),
  };

  for (const [role, expectedSymbol] of [
    ["symbol", input.symbol],
    ["benchmark", input.benchmarkSymbol],
  ] as const) {
    const series = byRole[role].toSorted(
      (left, right) => left.ordinal - right.ordinal,
    );
    if (series.length < MINIMUM_SNAPSHOT_HISTORY) {
      throw new LedgerInvariantError(
        `${role} history needs at least ${MINIMUM_SNAPSHOT_HISTORY} sessions`,
      );
    }
    for (const [ordinal, reference] of series.entries()) {
      if (reference.ordinal !== ordinal) {
        throw new LedgerInvariantError(`${role} ordinals must be contiguous`);
      }
      if (reference.symbol !== expectedSymbol) {
        throw new LedgerInvariantError(
          `${role} reference has the wrong symbol`,
        );
      }
      if (reference.sessionDate > input.latestMarketSession) {
        throw new LedgerInvariantError(
          `${role} reference is after the latest market session`,
        );
      }
      if (
        ordinal > 0 &&
        reference.sessionDate <= series[ordinal - 1]!.sessionDate
      ) {
        throw new LedgerInvariantError(
          `${role} sessions must be strictly increasing`,
        );
      }
    }
    if (series.at(-1)?.sessionDate !== input.latestMarketSession) {
      throw new LedgerInvariantError(
        `${role} history must end at the latest market session`,
      );
    }
  }

  const symbols = byRole.symbol.toSorted(
    (left, right) => left.ordinal - right.ordinal,
  );
  const benchmarks = byRole.benchmark.toSorted(
    (left, right) => left.ordinal - right.ordinal,
  );
  if (
    symbols.length !== benchmarks.length ||
    symbols.some(
      (reference, ordinal) =>
        reference.sessionDate !== benchmarks[ordinal]?.sessionDate,
    )
  ) {
    throw new LedgerInvariantError(
      "symbol and benchmark histories must align by session and ordinal",
    );
  }
}
