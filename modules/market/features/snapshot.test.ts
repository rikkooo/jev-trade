import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildMarketFixture,
  cutoffOf,
  weekdaySessions,
} from "@/tests/fixtures/market/build-fixture";
import type { MarketBar, ProviderMarketData } from "../contracts";
import { MarketDataValidationError, buildMarketSnapshot } from "./snapshot";

function build(input = buildMarketFixture()) {
  return buildMarketSnapshot(input, {
    allowlistedSymbols: ["ACME"],
    cutoffSession: cutoffOf(input),
    knowledgeCutoffAt: `${cutoffOf(input)}T23:00:00.000Z`,
  });
}

function expectFailure(
  mutate: (input: ProviderMarketData) => void,
  code: MarketDataValidationError["code"],
): void {
  const input = buildMarketFixture();
  const cutoffSession = cutoffOf(input);
  mutate(input);
  expect(() =>
    buildMarketSnapshot(input, {
      allowlistedSymbols: ["ACME"],
      cutoffSession,
      knowledgeCutoffAt: `${cutoffSession}T23:00:00.000Z`,
    }),
  ).toThrowError(
    expect.objectContaining<Partial<MarketDataValidationError>>({ code }),
  );
}

describe("buildMarketSnapshot", () => {
  it("matches the golden deterministic feature vector at the warm-up boundary", () => {
    const input = buildMarketFixture({ sessionCount: 272 });
    const snapshot = build(input);

    expect(snapshot.cutoffSession).toBe(cutoffOf(input));
    expect(snapshot.knowledgeCutoffAt).toBe(`${cutoffOf(input)}T23:00:00.000Z`);
    expect(snapshot.providerFetchedAt).toBe(input.fetchedAt);
    expect(snapshot.providerSourceUpdatedAt).toBe(input.sourceUpdatedAt);
    expect(snapshot.sourceManifest).toContainEqual(
      expect.objectContaining({
        sourceId: input.bars.at(-1)!.sourceId,
        sourceHash: input.bars.at(-1)!.sourceHash,
      }),
    );
    expect(snapshot.bars).toHaveLength(272);
    expect(snapshot.features).toMatchObject({
      returns: {
        1: 0.0016949152542373724,
        5: 0.008532423208191142,
        20: 0.035026269702276736,
        60: 0.11299435028248594,
        252: 0.7433628318584071,
      },
      movingAverageDistance: {
        20: 0.016337059329320613,
        50: 0.04324801412180057,
        200: 0.20244150559511698,
      },
      rsi14: 100,
      drawdown60: 0,
      volumeRegime: 1.0075307173999208,
      benchmarkRegime: "risk_on",
    });
    expect(snapshot.features.atr14).toBeCloseTo(2.0875, 12);
    expect(snapshot.features.realizedVolatility20).toBeGreaterThanOrEqual(0);
    expect(snapshot.compactState.missingData).toEqual([]);
    expect(snapshot.compactState.staleness).toBe("fresh");
  });

  it("treats date-only sessions consistently across a daylight-saving transition", () => {
    const sessions = weekdaySessions(300, "2025-01-13");
    expect(sessions).toContain("2025-03-07");
    expect(sessions).toContain("2025-03-10");
    const snapshot = build(buildMarketFixture({ start: "2025-01-13" }));
    expect(snapshot.bars.some((bar) => bar.session === "2025-03-10")).toBe(
      true,
    );
  });

  it.each<
    [MarketDataValidationError["code"], (input: ProviderMarketData) => void]
  >([
    [
      "NONFINITE_VALUE",
      (input: ProviderMarketData) => {
        input.bars[20]!.adjusted.close = Number.NaN;
      },
    ],
    [
      "DUPLICATE_BAR",
      (input: ProviderMarketData) => {
        input.bars[20] = structuredClone(input.bars[19]!);
      },
    ],
    [
      "MISSING_SESSION",
      (input: ProviderMarketData) => {
        input.bars.splice(20, 1);
      },
    ],
    [
      "PARTIAL_BAR",
      (input: ProviderMarketData) => {
        input.bars.at(-1)!.completed = false;
      },
    ],
    [
      "STALE_BAR",
      (input: ProviderMarketData) => {
        input.bars.pop();
      },
    ],
    [
      "STALE_SOURCE",
      (input: ProviderMarketData) => {
        input.sourceUpdatedAt = "2020-01-01T00:00:00.000Z";
      },
    ],
    [
      "STALE_EVENT_CALENDAR",
      (input: ProviderMarketData) => {
        input.eventCalendar.asOfSession = input.bars.at(-2)!.session;
      },
    ],
    [
      "BENCHMARK_MISMATCH",
      (input: ProviderMarketData) => {
        input.benchmark.currency = "EUR";
      },
    ],
    [
      "ACTION_AMBIGUITY",
      (input: ProviderMarketData) => {
        input.actions.push({
          id: "split",
          symbol: "ACME",
          type: "split",
          effectiveSession: input.bars[100]!.session,
          status: "confirmed",
          splitRatio: 2,
          adjustmentStatus: "ambiguous",
          sourceId: "fixture:action:split",
          sourceRevision: "fixture-action-v1",
          sourceHash: "a".repeat(64),
          availableAt: `${cutoffOf(input)}T21:30:00.000Z`,
        });
      },
    ],
    [
      "RECENT_SPLIT",
      (input: ProviderMarketData) => {
        input.actions.push({
          id: "split",
          symbol: "ACME",
          type: "split",
          effectiveSession: input.bars.at(-5)!.session,
          status: "confirmed",
          splitRatio: 2,
          adjustmentStatus: "verified",
          sourceId: "fixture:action:split",
          sourceRevision: "fixture-action-v1",
          sourceHash: "a".repeat(64),
          availableAt: `${cutoffOf(input)}T21:30:00.000Z`,
        });
      },
    ],
  ])("fails closed with %s", (code, mutate) => {
    expectFailure(mutate, code);
  });

  it("fails closed when history cannot satisfy the exact warm-up", () => {
    const input = buildMarketFixture({ sessionCount: 271 });
    expect(() => build(input)).toThrowError(
      expect.objectContaining({ code: "INSUFFICIENT_HISTORY" }),
    );
  });

  it("does not let appended future bars change an earlier snapshot", () => {
    const base = buildMarketFixture();
    const cutoffSession = cutoffOf(base);
    const before = buildMarketSnapshot(base, {
      allowlistedSymbols: ["ACME"],
      cutoffSession,
      knowledgeCutoffAt: `${cutoffSession}T23:00:00.000Z`,
    });
    const later = structuredClone(base);
    const futureSessions = later.calendar.sessions.slice(300);

    const makeFuture = (
      symbol: string,
      session: string,
      seed: number,
    ): MarketBar => ({
      symbol,
      session,
      completed: true,
      sourceId: `fixture:future:${symbol}:${session}`,
      sourceRevision: `future-${session}`,
      sourceHash: "f".repeat(64),
      availableAt: `${session}T21:30:00.000Z`,
      adjusted: {
        open: seed,
        high: seed + 10,
        low: seed - 10,
        close: seed + 5,
        volume: seed * 1_000,
      },
      unadjusted: {
        open: seed,
        high: seed + 10,
        low: seed - 10,
        close: seed + 5,
        volume: seed * 1_000,
      },
    });
    later.bars.push(
      ...futureSessions.map((session, i) =>
        makeFuture("ACME", session, 900 + i),
      ),
    );
    later.benchmarkBars.push(
      ...futureSessions.map((session, i) =>
        makeFuture("BENCH", session, 1_900 + i),
      ),
    );
    const after = buildMarketSnapshot(later, {
      allowlistedSymbols: ["ACME"],
      cutoffSession,
      knowledgeCutoffAt: `${cutoffSession}T23:00:00.000Z`,
    });
    expect(after).toEqual(before);
  });

  it("accepts a completed same-day post-close revision known before the knowledge cutoff", () => {
    const input = buildMarketFixture();
    const cutoffSession = cutoffOf(input);

    expect(() =>
      buildMarketSnapshot(input, {
        allowlistedSymbols: ["ACME"],
        cutoffSession,
        knowledgeCutoffAt: `${cutoffSession}T23:00:00.000Z`,
      }),
    ).not.toThrow();
  });

  it("rejects a selected provider revision first observed after the knowledge cutoff", () => {
    const input = buildMarketFixture();
    const cutoffSession = cutoffOf(input);
    input.bars.at(-1)!.availableAt = `${cutoffSession}T23:00:00.001Z`;

    expect(() =>
      buildMarketSnapshot(input, {
        allowlistedSymbols: ["ACME"],
        cutoffSession,
        knowledgeCutoffAt: `${cutoffSession}T23:00:00.000Z`,
      }),
    ).toThrowError(expect.objectContaining({ code: "FUTURE_SOURCE_REVISION" }));
  });

  it("rejects a revision reported as available after the provider fetch", () => {
    const input = buildMarketFixture();
    const cutoffSession = cutoffOf(input);
    input.bars.at(-1)!.availableAt = `${cutoffSession}T22:30:00.000Z`;

    expect(() =>
      buildMarketSnapshot(input, {
        allowlistedSymbols: ["ACME"],
        cutoffSession,
        knowledgeCutoffAt: `${cutoffSession}T23:00:00.000Z`,
      }),
    ).toThrowError(expect.objectContaining({ code: "FUTURE_SOURCE_REVISION" }));
  });

  it("rejects a response fetched or updated after the knowledge cutoff", () => {
    const input = buildMarketFixture();
    const cutoffSession = cutoffOf(input);
    input.fetchedAt = `${cutoffSession}T23:00:00.001Z`;

    expect(() =>
      buildMarketSnapshot(input, {
        allowlistedSymbols: ["ACME"],
        cutoffSession,
        knowledgeCutoffAt: `${cutoffSession}T23:00:00.000Z`,
      }),
    ).toThrowError(expect.objectContaining({ code: "FUTURE_SOURCE_REVISION" }));
  });

  it("keeps every derived number finite and bounded under valid scale changes", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (priceScale, volumeScale) => {
          const input = buildMarketFixture();
          for (const bar of [...input.bars, ...input.benchmarkBars]) {
            for (const price of ["open", "high", "low", "close"] as const) {
              bar.adjusted[price] *= priceScale;
              bar.unadjusted[price] *= priceScale;
            }
            bar.adjusted.volume *= volumeScale;
            bar.unadjusted.volume *= volumeScale;
          }
          const features = build(input).features;
          const numbers: number[] = [];
          const collect = (value: unknown): void => {
            if (typeof value === "number") numbers.push(value);
            else if (value && typeof value === "object") {
              Object.values(value).forEach(collect);
            }
          };
          collect(features);
          expect(numbers.every(Number.isFinite)).toBe(true);
          expect(features.rsi14).toBeGreaterThanOrEqual(0);
          expect(features.rsi14).toBeLessThanOrEqual(100);
          expect(features.volatilityPercentile).toBeGreaterThanOrEqual(0);
          expect(features.volatilityPercentile).toBeLessThanOrEqual(1);
          expect(features.gapRiskPercentile).toBeGreaterThanOrEqual(0);
          expect(features.gapRiskPercentile).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 25 },
    );
  });
});
