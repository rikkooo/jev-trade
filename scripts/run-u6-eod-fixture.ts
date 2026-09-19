import { ManualClock } from "../modules/operations/jobs/clock";
import { InMemoryJobQueue } from "../modules/operations/jobs/queue";
import { runBoundedInvocation } from "../modules/operations/jobs/runner";
import { enqueueAvailableEodEvaluations } from "../modules/operations/jobs/scheduler";

const clock = new ManualClock("2026-09-21T22:00:00.000Z");
const queue = new InMemoryJobQueue({ now: () => clock.now() });

const scheduled = enqueueAvailableEodEvaluations(queue, {
  now: clock.now().toISOString(),
  sessions: [
    {
      session: "2026-09-21",
      closeAt: "2026-09-21T20:00:00.000Z",
      expectedBarAt: "2026-09-21T21:00:00.000Z",
    },
  ],
  symbols: [
    { symbol: "AAPL", latestCompletedBarSession: "2026-09-21" },
    { symbol: "MSFT", latestCompletedBarSession: "2026-09-21" },
  ],
  maxAttempts: 3,
});

const report = await runBoundedInvocation(queue, {
  workerId: "hq-fixture-recovery",
  clock,
  deadlineAt: "2026-09-21T22:01:00.000Z",
  minimumClaimBudgetMs: 1_000,
  leaseMs: 30_000,
  handlers: {
    eod_evaluation: async () => undefined,
  },
});

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "fixture",
      durable: false,
      targetSession: scheduled.targetSession,
      report,
      operations: queue.list().map((job) => ({
        operationKey: job.operationKey,
        status: job.status,
        attempts: job.attemptCount,
      })),
    },
    null,
    2,
  )}\n`,
);
