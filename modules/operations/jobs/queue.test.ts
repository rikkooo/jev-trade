import { describe, expect, it } from "vitest";

import { InMemoryJobQueue, JobQueueConflictError } from "./queue";

const start = "2026-09-21T22:00:00.000Z";

function queue() {
  let id = 0;
  return new InMemoryJobQueue({
    id: (prefix) => `${prefix}_${++id}`,
    retryDelayMs: () => 1_000,
  });
}

describe("in-memory job queue", () => {
  it("deduplicates concurrent enqueue and claim calls by operation key", async () => {
    const jobs = queue();
    const input = {
      operationKey: "eod:AAPL:2026-09-21",
      kind: "eod_evaluation" as const,
      payload: { symbol: "AAPL", cutoffSession: "2026-09-21" },
      availableAt: start,
      maxAttempts: 3,
    };

    const enqueued = await Promise.all([
      Promise.resolve().then(() => jobs.enqueue(input)),
      Promise.resolve().then(() => jobs.enqueue(input)),
    ]);
    expect(enqueued.filter((result) => result.created)).toHaveLength(1);

    const claimed = await Promise.all([
      Promise.resolve().then(() =>
        jobs.claim({ workerId: "cron-a", now: start, leaseMs: 30_000 }),
      ),
      Promise.resolve().then(() =>
        jobs.claim({ workerId: "cron-b", now: start, leaseMs: 30_000 }),
      ),
    ]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
  });

  it("claims the earliest available job and uses its id as a stable tie-breaker", () => {
    const jobs = queue();
    jobs.enqueue({
      operationKey: "eod:LATE:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "LATE" },
      availableAt: "2026-09-21T21:59:00.000Z",
      maxAttempts: 2,
    });
    const firstAtSameTime = jobs.enqueue({
      operationKey: "eod:FIRST:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "FIRST" },
      availableAt: "2026-09-21T21:58:00.000Z",
      maxAttempts: 2,
    }).job;
    jobs.enqueue({
      operationKey: "eod:SECOND:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "SECOND" },
      availableAt: "2026-09-21T21:58:00.000Z",
      maxAttempts: 2,
    });

    expect(
      jobs.claim({ workerId: "ordered", now: start, leaseMs: 30_000 })?.jobId,
    ).toBe(firstAtSameTime.id);
  });

  it("rejects reuse of an operation key with a different immutable payload", () => {
    const jobs = queue();
    jobs.enqueue({
      operationKey: "eod:AAPL:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "AAPL" },
      availableAt: start,
      maxAttempts: 2,
    });

    expect(() =>
      jobs.enqueue({
        operationKey: "eod:AAPL:2026-09-21",
        kind: "eod_evaluation",
        payload: { symbol: "MSFT" },
        availableAt: start,
        maxAttempts: 2,
      }),
    ).toThrow(JobQueueConflictError);

    expect(() =>
      jobs.enqueue({
        operationKey: "eod:AAPL:2026-09-21",
        kind: "eod_evaluation",
        payload: { symbol: "AAPL" },
        availableAt: "2026-09-21T23:00:00.000Z",
        maxAttempts: 3,
      }),
    ).toThrow(JobQueueConflictError);
  });

  it("rejects a replay key reused for a different replay target", () => {
    const jobs = queue();
    const firstTarget = jobs.enqueue({
      operationKey: "eod:AAPL:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "AAPL" },
      availableAt: start,
      maxAttempts: 2,
    }).job;
    const secondTarget = jobs.enqueue({
      operationKey: "eod:MSFT:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "MSFT" },
      availableAt: start,
      maxAttempts: 2,
    }).job;

    jobs.enqueue({
      operationKey: "replay:operator:stable",
      kind: "correction_replay",
      payload: { requestedBy: "operator@example.test" },
      availableAt: start,
      maxAttempts: 2,
      replayOfOperationId: firstTarget.id,
    });

    expect(() =>
      jobs.enqueue({
        operationKey: "replay:operator:stable",
        kind: "correction_replay",
        payload: { requestedBy: "operator@example.test" },
        availableAt: "2026-09-21T23:00:00.000Z",
        maxAttempts: 2,
        replayOfOperationId: secondTarget.id,
      }),
    ).toThrow(JobQueueConflictError);
  });

  it("expires a lease, records the failure, and backs off its reclaim", () => {
    const jobs = queue();
    jobs.enqueue({
      operationKey: "eod:ACME:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "ACME" },
      availableAt: start,
      maxAttempts: 3,
    });
    const first = jobs.claim({ workerId: "lost", now: start, leaseMs: 5_000 });
    expect(first).not.toBeNull();

    const duringBackoff = jobs.claim({
      workerId: "recovery",
      now: "2026-09-21T22:00:05.001Z",
      leaseMs: 5_000,
    });

    expect(duringBackoff).toBeNull();
    expect(jobs.get(first!.jobId)).toMatchObject({
      status: "retryable",
      attemptCount: 1,
      availableAt: "2026-09-21T22:00:06.001Z",
    });
    expect(jobs.attempts(first!.jobId)[0]).toMatchObject({
      status: "failed",
      errorCode: "LEASE_EXPIRED",
      events: [
        { status: "scheduled" },
        { status: "evaluating" },
        { status: "failed", errorCode: "LEASE_EXPIRED" },
      ],
    });

    expect(
      jobs.claim({
        workerId: "recovery",
        now: "2026-09-21T22:00:06.000Z",
        leaseMs: 5_000,
      }),
    ).toBeNull();
    expect(
      jobs.claim({
        workerId: "recovery",
        now: "2026-09-21T22:00:06.001Z",
        leaseMs: 5_000,
      })?.attemptNumber,
    ).toBe(2);
  });

  it("caps backoff when an expired lease is explicitly released", () => {
    const jobs = new InMemoryJobQueue({
      retryDelayMs: () => 10_000_000,
    });
    const job = jobs.enqueue({
      operationKey: "eod:ACME:2026-09-22",
      kind: "eod_evaluation",
      payload: { symbol: "ACME" },
      availableAt: start,
      maxAttempts: 3,
    }).job;
    const lease = jobs.claim({
      workerId: "slow-worker",
      now: start,
      leaseMs: 5_000,
    })!;

    jobs.release(lease, "2026-09-21T22:00:05.001Z", "LEASE_EXPIRED");

    expect(jobs.get(job.id)).toMatchObject({
      status: "retryable",
      attemptCount: 1,
      availableAt: "2026-09-21T22:05:05.001Z",
    });
    expect(jobs.attempts(job.id)[0]).toMatchObject({
      status: "failed",
      errorCode: "LEASE_EXPIRED",
    });
  });

  it("extends live leases and rejects stale lease tokens", () => {
    const jobs = queue();
    jobs.enqueue({
      operationKey: "resolution:AAPL:f1",
      kind: "outcome_resolution",
      payload: { forecastId: "f1" },
      availableAt: start,
      maxAttempts: 2,
    });
    const lease = jobs.claim({
      workerId: "worker",
      now: start,
      leaseMs: 5_000,
    })!;
    const updated = jobs.heartbeat({
      lease,
      now: "2026-09-21T22:00:04.000Z",
      leaseMs: 5_000,
    });
    expect(updated.leasedUntil).toBe("2026-09-21T22:00:09.000Z");

    jobs.succeed(updated, "2026-09-21T22:00:04.500Z");
    expect(() => jobs.succeed(lease, "2026-09-21T22:00:04.600Z")).toThrow(
      /lease/i,
    );
  });

  it("replays idempotently even when the retry is scheduled later", () => {
    const jobs = queue();
    const original = jobs.enqueue({
      operationKey: "judgment:AAPL:2026-09-21",
      kind: "eod_evaluation",
      payload: { symbol: "AAPL" },
      availableAt: start,
      maxAttempts: 2,
    }).job;
    const first = jobs.claim({ workerId: "a", now: start, leaseMs: 10_000 })!;
    jobs.fail(first, {
      at: start,
      code: "JUDGMENT_FAILED",
      retryable: true,
    });
    expect(
      jobs.enqueue({
        operationKey: "judgment:AAPL:2026-09-21",
        kind: "eod_evaluation",
        payload: { symbol: "AAPL" },
        availableAt: start,
        maxAttempts: 2,
      }).created,
    ).toBe(false);
    const second = jobs.claim({
      workerId: "b",
      now: "2026-09-21T22:00:01.000Z",
      leaseMs: 10_000,
    })!;
    jobs.fail(second, {
      at: "2026-09-21T22:00:01.100Z",
      code: "JUDGMENT_FAILED",
      retryable: true,
    });
    expect(jobs.get(original.id)?.status).toBe("dead_letter");

    const replay = jobs.operatorReplay({
      operationId: original.id,
      idempotencyKey: "ops-20260921-aapl",
      requestedBy: "operator@example.test",
      reason: "Provider recovered",
      now: "2026-09-21T22:05:00.000Z",
    });
    expect(replay.job.replayOfOperationId).toBe(original.id);
    expect(replay.job.payload).toMatchObject({
      replay: { failedAttemptId: expect.stringMatching(/^attempt_/) },
    });
    expect(
      jobs.operatorReplay({
        operationId: original.id,
        idempotencyKey: "ops-20260921-aapl",
        requestedBy: "operator@example.test",
        reason: "Provider recovered",
        now: "2026-09-21T22:06:00.000Z",
      }).created,
    ).toBe(false);
  });

  it("enqueues correction recomputation without changing the completed original", async () => {
    const { enqueueCorrectionReplays } = await import("./scheduler");
    const jobs = queue();
    const original = jobs.enqueue({
      operationKey: "resolution:forecast-1:2026-09-21",
      kind: "outcome_resolution",
      payload: { forecastId: "forecast-1" },
      availableAt: start,
      maxAttempts: 3,
    }).job;
    const lease = jobs.claim({
      workerId: "worker",
      now: start,
      leaseMs: 5_000,
    })!;
    jobs.succeed(lease, "2026-09-21T22:00:01.000Z");

    const replays = enqueueCorrectionReplays(jobs, {
      sourceRecordId: "provider-correction-7",
      reason: "Vendor corrected the horizon close",
      requestedBy: "operator@example.test",
      idempotencyKey: "correction-20260921-0007",
      affectedOperationIds: [original.id, original.id],
      now: "2026-09-21T23:00:00.000Z",
    });

    expect(replays).toHaveLength(1);
    expect(replays[0]).toMatchObject({
      kind: "correction_replay",
      replayOfOperationId: original.id,
      status: "queued",
    });
    expect(jobs.get(original.id)?.status).toBe("succeeded");

    const retried = enqueueCorrectionReplays(jobs, {
      sourceRecordId: "provider-correction-7",
      reason: "Vendor corrected the horizon close",
      requestedBy: "operator@example.test",
      idempotencyKey: "correction-20260921-0007",
      affectedOperationIds: [original.id],
      now: "2026-09-22T00:00:00.000Z",
    });
    expect(retried).toHaveLength(1);
    expect(retried[0]?.id).toBe(replays[0]?.id);

    const freshReplay = enqueueCorrectionReplays(jobs, {
      sourceRecordId: "provider-correction-7",
      reason: "Vendor corrected the horizon close",
      requestedBy: "operator@example.test",
      idempotencyKey: "correction-20260921-0008",
      affectedOperationIds: [original.id],
      now: "2026-09-22T00:01:00.000Z",
    });
    expect(freshReplay[0]?.id).not.toBe(replays[0]?.id);
  });
});
