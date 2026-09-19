import type { JsonValue } from "@/modules/ledger/canonical-json";

import { systemClock, toTimestamp, type Clock } from "./clock";
import type { JobKind, JobLease, JobOperation, JobQueue } from "./types";

export class JobExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly safeDetails?: Readonly<Record<string, JsonValue>>,
  ) {
    super("The job handler reported a classified failure.");
    this.name = "JobExecutionError";
  }
}

export interface JobHandlerContext {
  readonly job: Pick<JobOperation, "id" | "operationKey" | "kind" | "payload">;
  readonly lease: JobLease;
  readonly clock: Clock;
  readonly deadlineAt: string;
  readonly signal: AbortSignal;
  heartbeat(): JobLease;
}

export type JobHandler = (context: JobHandlerContext) => Promise<void>;

export interface InvocationReport {
  readonly invocationId: string;
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly released: number;
  readonly lostLeases: number;
  readonly expiredCompletions: number;
  readonly stopReason: "QUEUE_EMPTY" | "DEADLINE_REACHED" | "MAX_CLAIMS";
}

function ownsLease(queue: JobQueue, lease: JobLease): boolean {
  const current = queue.get(lease.jobId);
  return (
    current?.status === "leased" &&
    current.leaseOwner === lease.workerId &&
    current.leaseToken === lease.leaseToken &&
    current.attemptCount === lease.attemptNumber
  );
}

export interface RunInvocationOptions {
  readonly workerId: string;
  readonly clock?: Clock;
  readonly deadlineAt: string;
  readonly minimumClaimBudgetMs: number;
  readonly leaseMs: number;
  readonly maxClaims?: number;
  readonly handlers: Partial<Record<JobKind, JobHandler>>;
  readonly invocationId?: string;
}

function remaining(clock: Clock, deadlineAt: string): number {
  return toTimestamp(deadlineAt, "invocation deadline") - clock.now().getTime();
}

class InvocationDeadlineError extends Error {
  constructor() {
    super("The invocation deadline elapsed.");
    this.name = "InvocationDeadlineError";
  }
}

export async function runBoundedInvocation(
  queue: JobQueue,
  options: RunInvocationOptions,
): Promise<InvocationReport> {
  const clock = options.clock ?? systemClock;
  if (
    !Number.isInteger(options.minimumClaimBudgetMs) ||
    options.minimumClaimBudgetMs < 0 ||
    !Number.isInteger(options.leaseMs) ||
    options.leaseMs < 1
  ) {
    throw new Error("invocation timing options are invalid");
  }
  const maxClaims = options.maxClaims ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(maxClaims) || maxClaims < 1) {
    throw new Error("maxClaims must be a positive integer");
  }
  const counts = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    released: 0,
    lostLeases: 0,
    expiredCompletions: 0,
  };
  let stopReason: InvocationReport["stopReason"] = "QUEUE_EMPTY";

  while (counts.claimed < maxClaims) {
    if (remaining(clock, options.deadlineAt) < options.minimumClaimBudgetMs) {
      stopReason = "DEADLINE_REACHED";
      break;
    }
    const claimedLease = queue.claim({
      workerId: options.workerId,
      now: clock.now().toISOString(),
      leaseMs: options.leaseMs,
    });
    if (claimedLease === null) {
      stopReason = "QUEUE_EMPTY";
      break;
    }
    let lease: JobLease = claimedLease;
    counts.claimed += 1;
    const job = queue.get(lease.jobId);
    if (job === undefined) throw new Error("claimed job disappeared");
    const handler = options.handlers[lease.kind];
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (handler === undefined) {
        throw new JobExecutionError("HANDLER_NOT_CONFIGURED", false);
      }
      const timeoutMs = Math.max(0, remaining(clock, options.deadlineAt));
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort(new InvocationDeadlineError());
          reject(new InvocationDeadlineError());
        }, timeoutMs);
      });
      await Promise.race([
        handler({
          job,
          lease,
          clock,
          deadlineAt: options.deadlineAt,
          signal: controller.signal,
          heartbeat: () => {
            lease = queue.heartbeat({
              lease,
              now: clock.now().toISOString(),
              leaseMs: options.leaseMs,
            });
            return lease;
          },
        }),
        deadline,
      ]);
      clearTimeout(timer);
      const completedAtInstant = clock.now();
      const completedAt = completedAtInstant.toISOString();
      if (
        toTimestamp(lease.leasedUntil, "lease expiry") <=
        completedAtInstant.getTime()
      ) {
        queue.reconcileExpiredCompletion(lease, completedAt);
        counts.expiredCompletions += 1;
        continue;
      }
      queue.succeed(lease, completedAt);
      counts.succeeded += 1;
    } catch (error) {
      if (timer !== undefined) clearTimeout(timer);
      const now = clock.now().toISOString();
      const deadlineReached =
        error instanceof InvocationDeadlineError ||
        remaining(clock, options.deadlineAt) <= 0;
      if (!ownsLease(queue, lease)) {
        counts.lostLeases += 1;
        if (deadlineReached) {
          stopReason = "DEADLINE_REACHED";
          break;
        }
        continue;
      }
      const leaseExpired =
        toTimestamp(lease.leasedUntil, "lease expiry") <= clock.now().getTime();
      if (deadlineReached) {
        if (leaseExpired) {
          queue.release(lease, now, "LEASE_EXPIRED");
          counts.released += 1;
        }
        stopReason = "DEADLINE_REACHED";
        break;
      }
      if (leaseExpired) {
        queue.release(lease, now, "LEASE_EXPIRED");
        counts.released += 1;
        continue;
      }
      const failure =
        error instanceof JobExecutionError
          ? error
          : new JobExecutionError("UNEXPECTED_JOB_FAILURE", true);
      queue.fail(lease, {
        at: now,
        code: failure.code,
        retryable: failure.retryable,
        ...(failure.safeDetails === undefined
          ? {}
          : { details: failure.safeDetails }),
      });
      counts.failed += 1;
    }
  }
  if (counts.claimed >= maxClaims && stopReason === "QUEUE_EMPTY") {
    stopReason = "MAX_CLAIMS";
  }
  return {
    invocationId:
      options.invocationId ??
      `invocation:${options.workerId}:${clock.now().toISOString()}`,
    ...counts,
    stopReason,
  };
}
