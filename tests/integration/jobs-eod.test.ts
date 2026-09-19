import { describe, expect, it } from "vitest";

import { ManualClock } from "../../modules/operations/jobs/clock";
import { InMemoryJobQueue } from "../../modules/operations/jobs/queue";
import { runBoundedInvocation } from "../../modules/operations/jobs/runner";
import { enqueueAvailableEodEvaluations } from "../../modules/operations/jobs/scheduler";

describe("EOD cron concurrency", () => {
  it("publishes one immutable result when duplicate cron invocations race", async () => {
    const clock = new ManualClock("2026-09-21T22:00:00.000Z");
    const jobs = new InMemoryJobQueue({ now: () => clock.now() });
    const schedule = [
      {
        session: "2026-09-21",
        closeAt: "2026-09-21T20:00:00.000Z",
        expectedBarAt: "2026-09-21T21:00:00.000Z",
      },
    ];
    await Promise.all([
      Promise.resolve().then(() =>
        enqueueAvailableEodEvaluations(jobs, {
          now: clock.now().toISOString(),
          sessions: schedule,
          symbols: [
            { symbol: "AAPL", latestCompletedBarSession: "2026-09-21" },
          ],
          maxAttempts: 3,
        }),
      ),
      Promise.resolve().then(() =>
        enqueueAvailableEodEvaluations(jobs, {
          now: clock.now().toISOString(),
          sessions: schedule,
          symbols: [
            { symbol: "AAPL", latestCompletedBarSession: "2026-09-21" },
          ],
          maxAttempts: 3,
        }),
      ),
    ]);

    const publications = new Set<string>();
    const handler = async ({ job }: { job: { operationKey: string } }) => {
      publications.add(job.operationKey);
    };
    const options = (workerId: string) => ({
      workerId,
      clock,
      deadlineAt: "2026-09-21T22:01:00.000Z",
      minimumClaimBudgetMs: 100,
      leaseMs: 10_000,
      maxClaims: 1,
      handlers: { eod_evaluation: handler },
    });
    await Promise.all([
      runBoundedInvocation(jobs, options("cron-a")),
      runBoundedInvocation(jobs, options("cron-b")),
    ]);

    expect(publications).toEqual(new Set(["eod:AAPL:2026-09-21"]));
    expect(jobs.list()).toHaveLength(1);
    expect(jobs.list()[0]?.status).toBe("succeeded");
  });
});
