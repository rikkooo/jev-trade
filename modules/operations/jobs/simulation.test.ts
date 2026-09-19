import { describe, expect, it } from "vitest";

import { ManualClock } from "./clock";
import { InMemoryJobQueue } from "./queue";
import { runBoundedInvocation } from "./runner";
import {
  enqueueAvailableEodEvaluations,
  type ExchangeSessionWindow,
} from "./scheduler";

function novemberSessions(): ExchangeSessionWindow[] {
  const sessions: ExchangeSessionWindow[] = [];
  for (let day = 1; day <= 30; day += 1) {
    const date = new Date(Date.UTC(2026, 10, day));
    const weekday = date.getUTCDay();
    const session = date.toISOString().slice(0, 10);
    if (weekday === 0 || weekday === 6 || session === "2026-11-26") continue;
    const halfDay = session === "2026-11-27";
    sessions.push({
      session,
      closeAt: `${session}T${halfDay ? "18" : "21"}:00:00.000Z`,
      expectedBarAt: `${session}T${halfDay ? "18" : "21"}:30:00.000Z`,
    });
  }
  return sessions;
}

describe("accelerated EOD soak", () => {
  it("runs 30 calendar days without duplicate symbol/cutoff operations", async () => {
    const sessions = novemberSessions();
    const clock = new ManualClock("2026-11-02T21:30:00.000Z");
    const jobs = new InMemoryJobQueue({ now: () => clock.now() });

    for (const window of sessions) {
      clock.set(window.expectedBarAt);
      const input = {
        now: clock.now().toISOString(),
        sessions,
        symbols: [
          { symbol: "AAPL", latestCompletedBarSession: window.session },
          { symbol: "MSFT", latestCompletedBarSession: window.session },
        ],
        maxAttempts: 3,
      };
      enqueueAvailableEodEvaluations(jobs, input);
      enqueueAvailableEodEvaluations(jobs, input);
      await runBoundedInvocation(jobs, {
        workerId: `fixture-${window.session}`,
        clock,
        deadlineAt: `${window.session}T23:59:00.000Z`,
        minimumClaimBudgetMs: 100,
        leaseMs: 30_000,
        handlers: { eod_evaluation: async () => undefined },
      });
    }

    expect(jobs.list()).toHaveLength(sessions.length * 2);
    expect(new Set(jobs.list().map((job) => job.operationKey)).size).toBe(
      sessions.length * 2,
    );
    expect(jobs.list().every((job) => job.status === "succeeded")).toBe(true);
    expect(jobs.list().every((job) => job.attemptCount === 1)).toBe(true);
  });
});
