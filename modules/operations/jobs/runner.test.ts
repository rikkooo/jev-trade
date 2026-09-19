import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPolicyJudgment } from "@/tests/fixtures/policy/judgments";
import { JudgmentProviderError } from "@/modules/judgment/errors";

import { ManualClock, type Clock } from "./clock";
import { monitorOpenPosition } from "./monitoring";
import { InMemoryJobQueue } from "./queue";
import { JobExecutionError, runBoundedInvocation } from "./runner";

function makeQueue(clock: Clock) {
  let id = 0;
  return new InMemoryJobQueue({
    id: (prefix) => `${prefix}_${++id}`,
    retryDelayMs: () => 0,
    now: () => clock.now(),
  });
}

class TickingClock implements Clock {
  #now: number;

  constructor(now: string) {
    this.#now = Date.parse(now);
  }

  now(): Date {
    const current = new Date(this.#now);
    this.#now += 1;
    return current;
  }
}

describe("bounded job invocation", () => {
  afterEach(() => vi.useRealTimers());

  it("stops new claims at the deadline without releasing a live lease", async () => {
    const clock = new ManualClock("2026-09-21T22:00:00.000Z");
    const jobs = makeQueue(clock);
    for (const symbol of ["AAPL", "MSFT"]) {
      jobs.enqueue({
        operationKey: `eod:${symbol}:2026-09-21`,
        kind: "eod_evaluation",
        payload: { symbol },
        availableAt: clock.now().toISOString(),
        maxAttempts: 3,
      });
    }

    const report = await runBoundedInvocation(jobs, {
      workerId: "cron-1",
      clock,
      deadlineAt: "2026-09-21T22:00:05.000Z",
      minimumClaimBudgetMs: 1_000,
      leaseMs: 10_000,
      handlers: {
        eod_evaluation: async () => {
          clock.advance(5_000);
          throw new Error("function deadline");
        },
      },
    });

    expect(report).toMatchObject({
      claimed: 1,
      succeeded: 0,
      failed: 0,
      released: 0,
      stopReason: "DEADLINE_REACHED",
    });
    expect(jobs.list().filter((job) => job.status === "leased")).toHaveLength(
      1,
    );
    expect(jobs.list().filter((job) => job.status === "queued")).toHaveLength(
      1,
    );
  });

  it("records a Jev outage while preserving a deterministic stop exit", async () => {
    const clock = new ManualClock("2026-09-21T22:00:00.000Z");
    const jobs = makeQueue(clock);
    const decisions: unknown[] = [];
    const job = jobs.enqueue({
      operationKey: "monitor:AAPL:2026-09-21",
      kind: "position_monitor",
      payload: { symbol: "AAPL" },
      availableAt: clock.now().toISOString(),
      maxAttempts: 2,
    }).job;

    await runBoundedInvocation(jobs, {
      workerId: "cron",
      clock,
      deadlineAt: "2026-09-21T22:01:00.000Z",
      minimumClaimBudgetMs: 1_000,
      leaseMs: 30_000,
      maxClaims: 1,
      handlers: {
        position_monitor: async () => {
          const result = await monitorOpenPosition({
            policyInput: {
              dataQuality: { valid: true, fresh: true },
              marketRisk: { index: 30, band: "LOW" },
              sizing: { valid: false, reason: "INVALID_INPUT" },
              position: {
                stopPrice: 95,
                completedSessionLow: 95,
                eligibleSessionsHeld: 3,
                horizonSessions: 20,
                consecutiveHoldFailures: 0,
              },
            },
            evaluateJudgment: async () => {
              throw new JudgmentProviderError("PROVIDER_UNAVAILABLE", true);
            },
          });
          decisions.push(result.decision);
          if (result.failure) {
            throw new JobExecutionError(
              "JUDGMENT_FAILED",
              true,
              result.failure,
            );
          }
        },
      },
    });

    expect(decisions).toMatchObject([{ action: "EXIT", exitReason: "stop" }]);
    expect(jobs.get(job.id)).toMatchObject({ status: "retryable" });
    expect(jobs.attempts(job.id)[0]).toMatchObject({
      status: "failed",
      errorCode: "JUDGMENT_FAILED",
    });
    expect(JSON.stringify(jobs.attempts(job.id)[0])).not.toContain("secret");
  });

  it("allows a successful judgment-driven hold", async () => {
    const result = await monitorOpenPosition({
      policyInput: {
        dataQuality: { valid: true, fresh: true },
        marketRisk: { index: 30, band: "LOW" },
        sizing: { valid: false, reason: "INVALID_INPUT" },
        position: {
          stopPrice: 90,
          completedSessionLow: 100,
          eligibleSessionsHeld: 3,
          horizonSessions: 20,
          consecutiveHoldFailures: 1,
        },
      },
      evaluateJudgment: async () => buildPolicyJudgment(),
    });
    expect(result).toMatchObject({
      judgmentStatus: "succeeded",
      decision: { action: "HOLD", consecutiveHoldFailures: 0 },
    });
  });

  it("keeps the horizon exit active during a Jev outage", async () => {
    const result = await monitorOpenPosition({
      policyInput: {
        dataQuality: { valid: true, fresh: true },
        marketRisk: { index: 30, band: "LOW" },
        sizing: { valid: false, reason: "INVALID_INPUT" },
        position: {
          stopPrice: 90,
          completedSessionLow: 100,
          eligibleSessionsHeld: 20,
          horizonSessions: 20,
          consecutiveHoldFailures: 0,
        },
      },
      evaluateJudgment: async () => {
        throw new JudgmentProviderError("TIMEOUT", true);
      },
    });
    expect(result).toMatchObject({
      judgmentStatus: "failed",
      decision: { action: "EXIT", exitReason: "horizon" },
      failure: { providerCode: "TIMEOUT", retryable: true },
    });
  });

  it("aborts at the deadline while its lease fences a second worker", async () => {
    vi.useFakeTimers();
    const clock = new ManualClock("2026-09-21T22:00:00.000Z");
    const jobs = makeQueue(clock);
    jobs.enqueue({
      operationKey: "eod:AAPL:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "AAPL" },
      availableAt: clock.now().toISOString(),
      maxAttempts: 2,
    });
    let observedAbort = false;
    let finishIgnoredHandler: (() => void) | undefined;
    const invocation = runBoundedInvocation(jobs, {
      workerId: "cron",
      clock,
      deadlineAt: "2026-09-21T22:00:05.000Z",
      minimumClaimBudgetMs: 0,
      leaseMs: 10_000,
      handlers: {
        eod_evaluation: ({ signal }) =>
          new Promise<void>((resolve) => {
            finishIgnoredHandler = resolve;
            signal.addEventListener("abort", () => {
              observedAbort = true;
            });
          }),
      },
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(invocation).resolves.toMatchObject({
      released: 0,
      stopReason: "DEADLINE_REACHED",
    });
    expect(observedAbort).toBe(true);
    expect(jobs.list()[0]).toMatchObject({
      status: "leased",
      leaseOwner: "cron",
      attemptCount: 1,
    });

    clock.advance(5_000);
    const replacementRuns: string[] = [];
    const secondWorker = await runBoundedInvocation(jobs, {
      workerId: "replacement",
      clock,
      deadlineAt: "2026-09-21T22:00:09.000Z",
      minimumClaimBudgetMs: 0,
      leaseMs: 10_000,
      maxClaims: 1,
      handlers: {
        eod_evaluation: async () => {
          replacementRuns.push("replacement");
        },
      },
    });

    expect(secondWorker).toMatchObject({
      claimed: 0,
      stopReason: "QUEUE_EMPTY",
    });
    expect(replacementRuns).toEqual([]);
    finishIgnoredHandler?.();
  });

  it("backs off an expired lease instead of exhausting attempts", async () => {
    const clock = new ManualClock("2026-09-21T22:00:00.000Z");
    const jobs = makeQueue(clock);
    const job = jobs.enqueue({
      operationKey: "eod:AAPL:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "AAPL" },
      availableAt: clock.now().toISOString(),
      maxAttempts: 3,
    }).job;

    const report = await runBoundedInvocation(jobs, {
      workerId: "expired-worker",
      clock,
      deadlineAt: "2026-09-21T22:01:00.000Z",
      minimumClaimBudgetMs: 0,
      leaseMs: 1_000,
      handlers: {
        eod_evaluation: async () => {
          clock.advance(1_001);
          throw new Error("handler outlived lease");
        },
      },
    });

    expect(report).toMatchObject({
      claimed: 1,
      failed: 0,
      released: 1,
      stopReason: "QUEUE_EMPTY",
    });
    expect(jobs.get(job.id)).toMatchObject({
      status: "retryable",
      attemptCount: 1,
      availableAt: "2026-09-21T22:00:02.001Z",
    });
  });

  it("dead-letters a handler that completes after its lease expires", async () => {
    const clock = new ManualClock("2026-09-21T22:00:00.000Z");
    const jobs = makeQueue(clock);
    const job = jobs.enqueue({
      operationKey: "eod:COMPLETE-LATE:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "LATE" },
      availableAt: clock.now().toISOString(),
      maxAttempts: 3,
    }).job;

    const report = await runBoundedInvocation(jobs, {
      workerId: "late-worker",
      clock,
      deadlineAt: "2026-09-21T22:01:00.000Z",
      minimumClaimBudgetMs: 0,
      leaseMs: 1_000,
      handlers: {
        eod_evaluation: async () => {
          clock.advance(1_001);
        },
      },
    });

    expect(report).toMatchObject({
      claimed: 1,
      succeeded: 0,
      released: 0,
      expiredCompletions: 1,
      stopReason: "QUEUE_EMPTY",
    });
    expect(jobs.get(job.id)).toMatchObject({
      status: "dead_letter",
      attemptCount: 1,
    });
    expect(jobs.attempts(job.id)[0]).toMatchObject({
      status: "failed",
      errorCode: "COMPLETED_AFTER_LEASE_EXPIRY",
    });
    expect(
      jobs.claim({
        workerId: "replacement-worker",
        now: clock.now().toISOString(),
        leaseMs: 10_000,
      }),
    ).toBeNull();
  });

  it("uses one completion instant at the exact lease boundary", async () => {
    const clock = new TickingClock("2026-09-21T22:00:00.000Z");
    const jobs = makeQueue(clock);
    const job = jobs.enqueue({
      operationKey: "eod:BOUNDARY:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "BOUNDARY" },
      availableAt: clock.now().toISOString(),
      maxAttempts: 2,
    }).job;

    const report = await runBoundedInvocation(jobs, {
      workerId: "boundary-worker",
      clock,
      deadlineAt: "2026-09-21T22:01:00.000Z",
      minimumClaimBudgetMs: 0,
      leaseMs: 3,
      maxClaims: 1,
      handlers: { eod_evaluation: async () => undefined },
    });

    expect(report).toMatchObject({
      succeeded: 1,
      expiredCompletions: 0,
      released: 0,
    });
    expect(jobs.get(job.id)?.status).toBe("succeeded");
  });

  it("reports a lost lease when another worker reclaims before cleanup", async () => {
    const clock = new ManualClock("2026-09-21T22:00:00.000Z");
    const jobs = makeQueue(clock);
    jobs.enqueue({
      operationKey: "eod:AAPL:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "AAPL" },
      availableAt: clock.now().toISOString(),
      maxAttempts: 3,
    });

    const report = await runBoundedInvocation(jobs, {
      workerId: "stale-worker",
      clock,
      deadlineAt: "2026-09-21T22:01:00.000Z",
      minimumClaimBudgetMs: 0,
      leaseMs: 1_000,
      maxClaims: 1,
      handlers: {
        eod_evaluation: async () => {
          clock.advance(1_001);
          expect(
            jobs.claim({
              workerId: "recovery-worker",
              now: clock.now().toISOString(),
              leaseMs: 10_000,
            }),
          ).toBeNull();
          clock.advance(1_000);
          const reclaimed = jobs.claim({
            workerId: "recovery-worker",
            now: clock.now().toISOString(),
            leaseMs: 10_000,
          });
          expect(reclaimed?.attemptNumber).toBe(2);
          // The stale handler completes after another worker owns attempt two.
        },
      },
    });

    expect(report).toMatchObject({
      claimed: 1,
      succeeded: 0,
      failed: 0,
      released: 0,
      lostLeases: 1,
      stopReason: "MAX_CLAIMS",
    });
    expect(jobs.list()[0]).toMatchObject({
      status: "leased",
      leaseOwner: "recovery-worker",
      attemptCount: 2,
    });
  });
});
