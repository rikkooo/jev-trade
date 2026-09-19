import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createCashDividendEvent,
  createEntryEvent,
  createMarkEvent,
  createSplitEvent,
  projectPaperPortfolio,
} from "./portfolio";

describe("paper portfolio event projection", () => {
  it("applies splits and dividends without mutating frozen forecast identity", () => {
    const deposit = {
      id: "deposit-1",
      type: "deposit" as const,
      cashDelta: 10_000,
      sharesDelta: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    const entry = createEntryEvent({
      id: "entry-1",
      symbol: "ACME",
      forecastId: "forecast-frozen",
      shares: 50,
      fillPrice: 100,
      createdAt: "2026-09-02T13:30:00.000Z",
    });
    const split = createSplitEvent({
      id: "split-1",
      symbol: "ACME",
      forecastId: "forecast-frozen",
      sharesBefore: 50,
      ratio: 2,
      createdAt: "2026-09-03T00:00:00.000Z",
    });
    const dividend = createCashDividendEvent({
      id: "dividend-1",
      symbol: "ACME",
      forecastId: "forecast-frozen",
      shares: 100,
      cashPerShare: 0.5,
      createdAt: "2026-09-04T00:00:00.000Z",
    });
    const mark = createMarkEvent({
      id: "mark-1",
      symbol: "ACME",
      price: 50,
      createdAt: "2026-09-04T20:00:00.000Z",
    });

    const projection = projectPaperPortfolio([
      deposit,
      entry,
      split,
      dividend,
      mark,
    ]);

    expect(projection.cash).toBe(5_050);
    expect(projection.positions.ACME).toMatchObject({
      shares: 100,
      markPrice: 50,
    });
    expect(projection.marketValue).toBe(5_000);
    expect(projection.equity).toBe(10_050);
    expect(entry.forecastId).toBe("forecast-frozen");
    expect(split.forecastId).toBe("forecast-frozen");
  });

  it("is idempotent by event id", () => {
    const entry = createEntryEvent({
      id: "entry-1",
      symbol: "ACME",
      forecastId: "forecast-1",
      shares: 10,
      fillPrice: 100,
      createdAt: "2026-09-02T13:30:00.000Z",
    });
    const projection = projectPaperPortfolio([
      {
        id: "deposit-1",
        type: "deposit",
        cashDelta: 10_000,
        sharesDelta: 0,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
      entry,
      entry,
    ]);

    expect(projection.cash).toBe(9_000);
    expect(projection.positions.ACME?.shares).toBe(10);
    expect(projection.duplicateEventIds).toEqual(["entry-1"]);
  });

  it("rejects reuse of an event id with different content", () => {
    const first = createMarkEvent({
      id: "mark-1",
      symbol: "ACME",
      price: 100,
      createdAt: "2026-09-03T00:00:00.000Z",
    });
    const collision = createMarkEvent({
      id: "mark-1",
      symbol: "ACME",
      price: 101,
      createdAt: "2026-09-03T00:00:00.000Z",
    });

    expect(() => projectPaperPortfolio([first, collision])).toThrow(
      "paper event id collision",
    );
  });

  it("rejects a dividend whose cash does not match the open share count", () => {
    const entry = createEntryEvent({
      id: "entry-1",
      symbol: "ACME",
      forecastId: "forecast-1",
      shares: 10,
      fillPrice: 100,
      createdAt: "2026-09-02T13:30:00.000Z",
    });
    const dividend = createCashDividendEvent({
      id: "dividend-1",
      symbol: "ACME",
      forecastId: "forecast-1",
      shares: 9,
      cashPerShare: 0.5,
      createdAt: "2026-09-03T00:00:00.000Z",
    });

    expect(() => projectPaperPortfolio([entry, dividend])).toThrow(
      "does not match open shares",
    );
  });

  it("preserves cash + marked positions = equity for generated long portfolios", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 1_000 }),
        (shares, fillPrice, markPrice) => {
          const cost = shares * fillPrice;
          const events = [
            {
              id: "deposit",
              type: "deposit" as const,
              cashDelta: cost + 10_000,
              sharesDelta: 0,
              createdAt: "2026-09-01T00:00:00.000Z",
            },
            createEntryEvent({
              id: "entry",
              symbol: "ACME",
              forecastId: "f",
              shares,
              fillPrice,
              createdAt: "2026-09-02T00:00:00.000Z",
            }),
            createMarkEvent({
              id: "mark",
              symbol: "ACME",
              price: markPrice,
              createdAt: "2026-09-03T00:00:00.000Z",
            }),
          ];
          const projection = projectPaperPortfolio(events);

          expect(projection.equity).toBe(
            projection.cash + projection.marketValue,
          );
        },
      ),
    );
  });
});
