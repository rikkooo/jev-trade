import { describe, expect, it } from "vitest";

import { InMemoryJobQueue } from "./queue";
import {
  eligibleSessionsAfter,
  enqueueAvailableEodEvaluations,
  enqueueDueOutcomeResolutions,
  enqueueOpenPositionMonitoring,
  nthEligibleSession,
} from "./scheduler";

describe("exchange-session scheduling", () => {
  const sessions = [
    {
      session: "2026-11-25",
      closeAt: "2026-11-25T21:00:00.000Z",
      expectedBarAt: "2026-11-25T21:20:00.000Z",
    },
    // Thanksgiving Day, November 26, is closed and intentionally absent.
    {
      session: "2026-11-27",
      closeAt: "2026-11-27T18:00:00.000Z",
      expectedBarAt: "2026-11-27T18:20:00.000Z",
    },
    // The weekend is intentionally absent.
    {
      session: "2026-11-30",
      closeAt: "2026-11-30T21:00:00.000Z",
      expectedBarAt: "2026-11-30T21:20:00.000Z",
    },
    {
      session: "2026-12-01",
      closeAt: "2026-12-01T21:00:00.000Z",
      expectedBarAt: "2026-12-01T21:20:00.000Z",
    },
  ] as const;

  it("counts eligible sessions across a half day, holiday, and weekend", () => {
    expect(eligibleSessionsAfter("2026-11-25", sessions)).toEqual([
      "2026-11-27",
      "2026-11-30",
      "2026-12-01",
    ]);
    expect(nthEligibleSession("2026-11-25", 2, sessions)).toBe("2026-11-30");
  });

  it("waits for the provider's completed bar even after the EOD window", () => {
    const queue = new InMemoryJobQueue();
    const result = enqueueAvailableEodEvaluations(queue, {
      now: "2026-11-30T22:00:00.000Z",
      sessions,
      symbols: [
        { symbol: "AAPL", latestCompletedBarSession: "2026-11-30" },
        { symbol: "MSFT", latestCompletedBarSession: "2026-11-27" },
      ],
      maxAttempts: 3,
    });

    expect(result.enqueued.map((job) => job.operationKey)).toEqual([
      "eod:AAPL:2026-11-30",
    ]);
    expect(result.delayed).toEqual([
      {
        symbol: "MSFT",
        expectedSession: "2026-11-30",
        latestCompletedBarSession: "2026-11-27",
      },
    ]);
  });

  it("enqueues monitoring once per open position and newly completed session", () => {
    const queue = new InMemoryJobQueue();
    const input = {
      cutoffSession: "2026-11-30",
      availableAt: "2026-11-30T21:20:00.000Z",
      maxAttempts: 3,
      positions: [
        {
          positionId: "position-1",
          symbol: "AAPL",
          lastMonitoredSession: "2026-11-27",
        },
        {
          positionId: "position-2",
          symbol: "MSFT",
          lastMonitoredSession: "2026-11-30",
        },
      ],
    } as const;
    expect(enqueueOpenPositionMonitoring(queue, input)).toMatchObject([
      { operationKey: "monitor:position-1:2026-11-30" },
    ]);
    expect(enqueueOpenPositionMonitoring(queue, input)).toHaveLength(1);
    expect(queue.list()).toHaveLength(1);
  });

  it("enqueues outcomes at the exact horizon boundary and skips terminal forecasts", () => {
    const queue = new InMemoryJobQueue();
    const enqueued = enqueueDueOutcomeResolutions(queue, {
      calendar: sessions,
      latestAvailableSession: "2026-11-30",
      availableAt: "2026-11-30T21:20:00.000Z",
      maxAttempts: 3,
      forecasts: [
        {
          forecastId: "forecast-due",
          symbol: "AAPL",
          cutoffSession: "2026-11-25",
          horizonSessions: 2,
          status: "published",
        },
        {
          forecastId: "forecast-future",
          symbol: "MSFT",
          cutoffSession: "2026-11-25",
          horizonSessions: 3,
          status: "published",
        },
        {
          forecastId: "forecast-resolved",
          symbol: "NVDA",
          cutoffSession: "2026-11-25",
          horizonSessions: 1,
          status: "resolved",
        },
      ],
    });
    expect(enqueued).toMatchObject([
      { operationKey: "resolution:forecast-due:2026-11-30" },
    ]);
  });
});
