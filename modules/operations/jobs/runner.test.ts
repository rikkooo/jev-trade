import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPolicyJudgment } from "@/tests/fixtures/policy/judgments";
import { JudgmentProviderError } from "@/modules/judgment/errors";

import { ManualClock } from "./clock";
import { monitorOpenPosition } from "./monitoring";
import { InMemoryJobQueue } from "./queue";
import { JobExecutionError, runBoundedInvocation } from "./runner";

function makeQueue(clock: ManualClock) {
  let id = 0;
  return new InMemoryJobQueue({
    id: (prefix) => `${prefix}_${++id}`,
    retryDelayMs: () => 0,
    now: () => clock.now(),
  });
}

describe("bounded job invocation", () => {
  afterEach(() => vi.useRealTimers());

  it("stops new claims at the deadline and releases active work for reclaim", async () => {
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
      released: 1,
      stopReason: "DEADLINE_REACHED",
    });
    expect(
      jobs.list().filter((job) => job.status === "retryable"),
    ).toHaveLength(1);
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

  it("aborts a handler at the invocation deadline and releases its lease", async () => {
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
    const invocation = runBoundedInvocation(jobs, {
      workerId: "cron",
      clock,
      deadlineAt: "2026-09-21T22:00:05.000Z",
      minimumClaimBudgetMs: 0,
      leaseMs: 10_000,
      handlers: {
        eod_evaluation: ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              observedAbort = true;
              reject(signal.reason);
            });
          }),
      },
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(invocation).resolves.toMatchObject({
      released: 1,
      stopReason: "DEADLINE_REACHED",
    });
    expect(observedAbort).toBe(true);
    expect(jobs.list()[0]?.status).toBe("retryable");
  });
});
