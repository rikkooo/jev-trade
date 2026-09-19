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

  it("accounts for an outage from durable high water without backdating forecasts", () => {
    const queue = new InMemoryJobQueue();
    const result = enqueueAvailableEodEvaluations(queue, {
      now: "2026-12-01T22:00:00.000Z",
      sessions,
      symbols: [
        { symbol: "AAPL", latestCompletedBarSession: "2026-12-01" },
        { symbol: "MSFT", latestCompletedBarSession: "2026-12-01" },
      ],
      lastScheduledSessionBySymbol: {
        AAPL: "2026-11-25",
        MSFT: "2026-11-25",
      },
      maxAttempts: 3,
    });

    expect(result).toMatchObject({
      targetSession: "2026-12-01",
      nextHighWaterSessionBySymbol: {
        AAPL: "2026-12-01",
        MSFT: "2026-12-01",
      },
      missed: [
        {
          symbol: "AAPL",
          session: "2026-11-27",
          reason: "MISSED_SCHEDULER_WINDOW",
          prospectiveEligible: false,
        },
        {
          symbol: "AAPL",
          session: "2026-11-30",
          reason: "MISSED_SCHEDULER_WINDOW",
          prospectiveEligible: false,
        },
        {
          symbol: "MSFT",
          session: "2026-11-27",
          reason: "MISSED_SCHEDULER_WINDOW",
          prospectiveEligible: false,
        },
        {
          symbol: "MSFT",
          session: "2026-11-30",
          reason: "MISSED_SCHEDULER_WINDOW",
          prospectiveEligible: false,
        },
      ],
    });
    expect(result.enqueued.map((job) => job.operationKey)).toEqual([
      "eod:AAPL:2026-12-01",
      "eod:MSFT:2026-12-01",
    ]);
    expect(
      queue
        .list()
        .some(
          (job) =>
            job.operationKey.includes("2026-11-27") ||
            job.operationKey.includes("2026-11-30"),
        ),
    ).toBe(false);

    const repeated = enqueueAvailableEodEvaluations(queue, {
      now: "2026-12-01T22:01:00.000Z",
      sessions,
      symbols: [
        { symbol: "AAPL", latestCompletedBarSession: "2026-12-01" },
        { symbol: "MSFT", latestCompletedBarSession: "2026-12-01" },
      ],
      lastScheduledSessionBySymbol: result.nextHighWaterSessionBySymbol,
      maxAttempts: 3,
    });
    expect(repeated).toMatchObject({
      targetSession: null,
      nextHighWaterSessionBySymbol: {
        AAPL: "2026-12-01",
        MSFT: "2026-12-01",
      },
      enqueued: [],
      delayed: [],
      missed: [],
    });
    expect(queue.list()).toHaveLength(2);
  });

  it("bounds first-run scheduling to the latest due session", () => {
    const queue = new InMemoryJobQueue();
    const result = enqueueAvailableEodEvaluations(queue, {
      now: "2026-12-01T22:00:00.000Z",
      sessions,
      symbols: [{ symbol: "AAPL", latestCompletedBarSession: "2026-12-01" }],
      lastScheduledSessionBySymbol: { AAPL: null },
      maxAttempts: 3,
    });

    expect(result.missed).toEqual([]);
    expect(result.enqueued).toMatchObject([
      { operationKey: "eod:AAPL:2026-12-01" },
    ]);
  });

  it("keeps high water open while the newest due bar is delayed", () => {
    const queue = new InMemoryJobQueue();
    const result = enqueueAvailableEodEvaluations(queue, {
      now: "2026-12-01T22:00:00.000Z",
      sessions,
      symbols: [{ symbol: "AAPL", latestCompletedBarSession: "2026-11-30" }],
      lastScheduledSessionBySymbol: { AAPL: "2026-11-30" },
      maxAttempts: 3,
    });

    expect(result).toMatchObject({
      targetSession: "2026-12-01",
      nextHighWaterSessionBySymbol: { AAPL: "2026-11-30" },
      enqueued: [],
      delayed: [
        {
          symbol: "AAPL",
          expectedSession: "2026-12-01",
          latestCompletedBarSession: "2026-11-30",
        },
      ],
    });
  });

  it("advances each symbol independently across mixed delayed and ready ticks", () => {
    const queue = new InMemoryJobQueue();
    const first = enqueueAvailableEodEvaluations(queue, {
      now: "2026-11-30T22:00:00.000Z",
      sessions,
      symbols: [
        { symbol: "AAPL", latestCompletedBarSession: "2026-11-30" },
        { symbol: "MSFT", latestCompletedBarSession: "2026-11-27" },
      ],
      lastScheduledSessionBySymbol: {
        AAPL: "2026-11-27",
        MSFT: "2026-11-27",
      },
      maxAttempts: 3,
    });

    expect(first).toMatchObject({
      nextHighWaterSessionBySymbol: {
        AAPL: "2026-11-30",
        MSFT: "2026-11-27",
      },
      missed: [],
    });
    expect(first.enqueued.map((job) => job.operationKey)).toEqual([
      "eod:AAPL:2026-11-30",
    ]);
    const healthyLease = queue.claim({
      workerId: "healthy-publisher",
      now: "2026-11-30T22:00:00.000Z",
      leaseMs: 10_000,
    })!;
    queue.succeed(healthyLease, "2026-11-30T22:00:01.000Z");

    const second = enqueueAvailableEodEvaluations(queue, {
      now: "2026-12-01T22:00:00.000Z",
      sessions,
      symbols: [
        { symbol: "AAPL", latestCompletedBarSession: "2026-12-01" },
        { symbol: "MSFT", latestCompletedBarSession: "2026-12-01" },
      ],
      // Exercise recovery from a stale cursor as well as the normal durable
      // per-symbol cursor path. The existing AAPL job remains authoritative.
      lastScheduledSessionBySymbol: {
        AAPL: "2026-11-27",
        MSFT: "2026-11-27",
      },
      maxAttempts: 3,
    });

    expect(second.nextHighWaterSessionBySymbol).toEqual({
      AAPL: "2026-12-01",
      MSFT: "2026-12-01",
    });
    expect(second.missed).toEqual([
      {
        idempotencyKey: "eod-missed:MSFT:2026-11-30",
        symbol: "MSFT",
        session: "2026-11-30",
        expectedBarAt: "2026-11-30T21:20:00.000Z",
        reason: "MISSED_SCHEDULER_WINDOW",
        prospectiveEligible: false,
      },
    ]);
    expect(second.missed).not.toContainEqual(
      expect.objectContaining({ symbol: "AAPL", session: "2026-11-30" }),
    );
    expect(second.enqueued.map((job) => job.operationKey)).toEqual([
      "eod:AAPL:2026-12-01",
      "eod:MSFT:2026-12-01",
    ]);

    const staleCursorRepeat = enqueueAvailableEodEvaluations(queue, {
      now: "2026-12-01T22:00:30.000Z",
      sessions,
      symbols: [
        { symbol: "AAPL", latestCompletedBarSession: "2026-12-01" },
        { symbol: "MSFT", latestCompletedBarSession: "2026-12-01" },
      ],
      lastScheduledSessionBySymbol: {
        AAPL: "2026-11-27",
        MSFT: "2026-11-27",
      },
      maxAttempts: 3,
    });
    expect(staleCursorRepeat.missed).toEqual(second.missed);
    expect(staleCursorRepeat.missed[0]?.idempotencyKey).toBe(
      "eod-missed:MSFT:2026-11-30",
    );
    expect(queue.list()).toHaveLength(3);

    const repeated = enqueueAvailableEodEvaluations(queue, {
      now: "2026-12-01T22:01:00.000Z",
      sessions,
      symbols: [
        { symbol: "AAPL", latestCompletedBarSession: "2026-12-01" },
        { symbol: "MSFT", latestCompletedBarSession: "2026-12-01" },
      ],
      lastScheduledSessionBySymbol: second.nextHighWaterSessionBySymbol,
      maxAttempts: 3,
    });
    expect(repeated).toMatchObject({
      targetSession: null,
      nextHighWaterSessionBySymbol: second.nextHighWaterSessionBySymbol,
      enqueued: [],
      delayed: [],
      missed: [],
    });
    expect(queue.list()).toHaveLength(3);
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
