import {
  canonicalJson,
  sha256Canonical,
  type JsonValue,
} from "@/modules/ledger/canonical-json";

import { toIsoInstant, toTimestamp } from "./clock";
import type {
  ClaimJobInput,
  EnqueueJobInput,
  EnqueueResult,
  JobAttemptRecord,
  JobAttemptEventRecord,
  JobFailureInput,
  JobLease,
  JobOperation,
  JobQueue,
  OperatorReplayInput,
} from "./types";

export class JobQueueConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobQueueConflictError";
  }
}

export class JobLeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobLeaseError";
  }
}

export interface InMemoryJobQueueOptions {
  readonly id?: (prefix: string) => string;
  readonly now?: () => Date;
  readonly retryDelayMs?: (attemptNumber: number) => number;
}

interface MutableJob {
  id: string;
  operationKey: string;
  kind: JobOperation["kind"];
  payload: Record<string, JsonValue>;
  payloadHash: string;
  status: JobOperation["status"];
  attemptCount: number;
  maxAttempts: number;
  scheduledAt: string;
  availableAt: string;
  replayOfOperationId?: string;
  leaseOwner?: string;
  leaseToken?: string;
  leasedUntil?: string;
  createdAt: string;
  updatedAt: string;
}

interface MutableAttempt {
  id: string;
  jobId: string;
  attemptNumber: number;
  workerId: string;
  status: JobAttemptRecord["status"];
  startedAt: string;
  completedAt?: string;
  errorCode?: string;
  details?: Record<string, JsonValue>;
  events: JobAttemptEventRecord[];
}

const MIN_LEASE_EXPIRY_BACKOFF_MS = 1_000;
const MAX_LEASE_EXPIRY_BACKOFF_MS = 300_000;

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required`);
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function immutableSignature(
  input: Pick<
    EnqueueJobInput,
    "operationKey" | "kind" | "payload" | "maxAttempts" | "replayOfOperationId"
  >,
): string {
  return canonicalJson({
    operationKey: input.operationKey,
    kind: input.kind,
    payload: input.payload,
    maxAttempts: input.maxAttempts,
    replayOfOperationId: input.replayOfOperationId ?? null,
  });
}

export class InMemoryJobQueue implements JobQueue {
  readonly #jobs = new Map<string, MutableJob>();
  readonly #jobIdByKey = new Map<string, string>();
  readonly #attempts: MutableAttempt[] = [];
  readonly #id: (prefix: string) => string;
  readonly #now: () => Date;
  readonly #retryDelayMs: (attemptNumber: number) => number;
  #nextId = 0;

  constructor(options: InMemoryJobQueueOptions = {}) {
    this.#id =
      options.id ?? ((prefix) => `${prefix}_${String(++this.#nextId)}`);
    this.#now = options.now ?? (() => new Date());
    this.#retryDelayMs =
      options.retryDelayMs ??
      ((attemptNumber) => Math.min(30_000 * 2 ** (attemptNumber - 1), 300_000));
  }

  enqueue(input: EnqueueJobInput): EnqueueResult {
    const operationKey = nonEmpty(input.operationKey, "operationKey");
    if (
      operationKey !== input.operationKey ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(operationKey)
    ) {
      throw new Error("operationKey has an invalid format");
    }
    const availableAt = toIsoInstant(input.availableAt, "availableAt");
    positiveInteger(input.maxAttempts, "maxAttempts");
    canonicalJson(input.payload);
    const existingId = this.#jobIdByKey.get(input.operationKey);
    if (existingId !== undefined) {
      const existing = this.#jobs.get(existingId)!;
      if (
        immutableSignature(input) !==
        immutableSignature({
          operationKey: existing.operationKey,
          kind: existing.kind,
          payload: existing.payload,
          maxAttempts: existing.maxAttempts,
          replayOfOperationId: existing.replayOfOperationId,
        })
      ) {
        throw new JobQueueConflictError(
          `Operation key ${input.operationKey} already has a different payload`,
        );
      }
      return { created: false, job: clone(existing) };
    }

    if (
      input.replayOfOperationId !== undefined &&
      !this.#jobs.has(input.replayOfOperationId)
    ) {
      throw new Error("replayed operation must already exist");
    }
    const now = toIsoInstant(this.#now(), "queue time");
    const job: MutableJob = {
      id: this.#id("job"),
      operationKey: input.operationKey,
      kind: input.kind,
      payload: clone(input.payload),
      payloadHash: sha256Canonical(input.payload),
      status: "queued",
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      scheduledAt: availableAt,
      availableAt,
      ...(input.replayOfOperationId === undefined
        ? {}
        : { replayOfOperationId: input.replayOfOperationId }),
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(job.id, job);
    this.#jobIdByKey.set(job.operationKey, job.id);
    return { created: true, job: clone(job) };
  }

  claim(input: ClaimJobInput): JobLease | null {
    const now = toIsoInstant(input.now, "claim time");
    const nowMs = toTimestamp(now, "claim time");
    positiveInteger(input.leaseMs, "leaseMs");
    const workerId = nonEmpty(input.workerId, "workerId");

    let candidate: MutableJob | undefined;
    for (const job of this.#jobs.values()) {
      if (
        job.status === "leased" &&
        job.leasedUntil !== undefined &&
        toTimestamp(job.leasedUntil, "lease expiry") <= nowMs
      ) {
        const canRetry = job.attemptCount < job.maxAttempts;
        const retryAt = canRetry ? this.#retryAt(job, nowMs, true) : now;
        this.#finalizeActiveAttempt(job, now, "LEASE_EXPIRED");
        this.#clearLease(job);
        if (!canRetry) {
          job.status = "dead_letter";
        } else {
          job.status = "retryable";
          job.availableAt = retryAt;
        }
        job.updatedAt = now;
      }

      if (
        (job.status === "queued" || job.status === "retryable") &&
        toTimestamp(job.availableAt, "job availability") <= nowMs &&
        job.attemptCount < job.maxAttempts &&
        (candidate === undefined ||
          job.availableAt < candidate.availableAt ||
          (job.availableAt === candidate.availableAt &&
            job.id.localeCompare(candidate.id) < 0))
      ) {
        candidate = job;
      }
    }
    if (candidate === undefined) return null;

    candidate.attemptCount += 1;
    candidate.status = "leased";
    candidate.leaseOwner = workerId;
    candidate.leaseToken = this.#id("lease");
    candidate.leasedUntil = new Date(nowMs + input.leaseMs).toISOString();
    candidate.updatedAt = now;
    this.#attempts.push({
      id: this.#id("attempt"),
      jobId: candidate.id,
      attemptNumber: candidate.attemptCount,
      workerId,
      status: "evaluating",
      startedAt: now,
      events: [
        { status: "scheduled", at: now },
        { status: "evaluating", at: now },
      ],
    });
    return this.#lease(candidate);
  }

  heartbeat(input: {
    readonly lease: JobLease;
    readonly now: string;
    readonly leaseMs: number;
  }): JobLease {
    const now = toIsoInstant(input.now, "heartbeat time");
    const nowMs = toTimestamp(now, "heartbeat time");
    positiveInteger(input.leaseMs, "leaseMs");
    const job = this.#requireLiveLease(input.lease, nowMs);
    job.leasedUntil = new Date(nowMs + input.leaseMs).toISOString();
    job.updatedAt = now;
    return this.#lease(job);
  }

  succeed(lease: JobLease, at: string): JobOperation {
    const completedAt = toIsoInstant(at, "completion time");
    const job = this.#requireLiveLease(
      lease,
      toTimestamp(completedAt, "completion time"),
    );
    this.#completeActiveAttempt(job, completedAt, "succeeded");
    job.status = "succeeded";
    job.updatedAt = completedAt;
    this.#clearLease(job);
    return clone(job);
  }

  reconcileExpiredCompletion(lease: JobLease, at: string): JobOperation {
    const completedAt = toIsoInstant(at, "completion reconciliation time");
    const job = this.#requireLeaseToken(lease);
    const completedAtMs = toTimestamp(
      completedAt,
      "completion reconciliation time",
    );
    if (
      job.leasedUntil === undefined ||
      toTimestamp(job.leasedUntil, "lease expiry") > completedAtMs
    ) {
      throw new JobLeaseError("lease is still live at completion");
    }
    this.#completeActiveAttempt(
      job,
      completedAt,
      "failed",
      "COMPLETED_AFTER_LEASE_EXPIRY",
    );
    // The handler may already have committed external side effects after it
    // lost ownership. Keep this terminal for operator inspection instead of
    // automatically running the same work again.
    job.status = "dead_letter";
    job.availableAt = completedAt;
    job.updatedAt = completedAt;
    this.#clearLease(job);
    return clone(job);
  }

  fail(lease: JobLease, failure: JobFailureInput): JobOperation {
    const failedAt = toIsoInstant(failure.at, "failure time");
    const job = this.#requireLiveLease(
      lease,
      toTimestamp(failedAt, "failure time"),
    );
    const code = nonEmpty(failure.code, "failure code");
    if (failure.details !== undefined) canonicalJson(failure.details);
    const canRetry = failure.retryable && job.attemptCount < job.maxAttempts;
    const retryAt = canRetry
      ? this.#retryAt(job, toTimestamp(failedAt, "failure time"), false)
      : failedAt;
    this.#completeActiveAttempt(job, failedAt, "failed", code, failure.details);
    job.status = canRetry ? "retryable" : "dead_letter";
    job.availableAt = retryAt;
    job.updatedAt = failedAt;
    this.#clearLease(job);
    return clone(job);
  }

  release(
    lease: JobLease,
    at: string,
    errorCode = "INVOCATION_DEADLINE",
  ): JobOperation {
    const releasedAt = toIsoInstant(at, "release time");
    const job = this.#requireLeaseToken(lease);
    const canRetry = job.attemptCount < job.maxAttempts;
    const retryAt = canRetry
      ? this.#retryAt(
          job,
          toTimestamp(releasedAt, "release time"),
          errorCode === "LEASE_EXPIRED",
        )
      : releasedAt;
    this.#completeActiveAttempt(
      job,
      releasedAt,
      "failed",
      nonEmpty(errorCode, "errorCode"),
    );
    job.status = canRetry ? "retryable" : "dead_letter";
    job.availableAt = retryAt;
    job.updatedAt = releasedAt;
    this.#clearLease(job);
    return clone(job);
  }

  operatorReplay(input: OperatorReplayInput): EnqueueResult {
    const operation = this.#jobs.get(input.operationId);
    if (operation === undefined) throw new Error("operation does not exist");
    if (operation.status !== "dead_letter") {
      throw new Error("only a dead-letter operation may be replayed");
    }
    const idempotencyKey = nonEmpty(input.idempotencyKey, "idempotencyKey");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) {
      throw new Error("idempotencyKey has an invalid format");
    }
    const requestedBy = nonEmpty(input.requestedBy, "requestedBy");
    const reason = nonEmpty(input.reason, "reason");
    const now = toIsoInstant(input.now, "replay time");
    return this.enqueue({
      operationKey: `operator-replay:${idempotencyKey}`,
      kind: operation.kind,
      payload: {
        ...operation.payload,
        replay: {
          requestedBy,
          reason,
          originalOperationKey: operation.operationKey,
          failedAttemptId: this.#attempts
            .filter((attempt) => attempt.jobId === operation.id)
            .at(-1)!.id,
        },
      },
      availableAt: now,
      maxAttempts: operation.maxAttempts,
      replayOfOperationId: operation.id,
    });
  }

  get(id: string): JobOperation | undefined {
    const job = this.#jobs.get(id);
    return job === undefined ? undefined : clone(job);
  }

  getByOperationKey(operationKey: string): JobOperation | undefined {
    const id = this.#jobIdByKey.get(operationKey);
    return id === undefined ? undefined : this.get(id);
  }

  list(): readonly JobOperation[] {
    return [...this.#jobs.values()].map(clone);
  }

  attempts(jobId: string): readonly JobAttemptRecord[] {
    return this.#attempts
      .filter((attempt) => attempt.jobId === jobId)
      .map(clone);
  }

  #lease(job: MutableJob): JobLease {
    if (
      job.leaseOwner === undefined ||
      job.leaseToken === undefined ||
      job.leasedUntil === undefined
    ) {
      throw new JobLeaseError("job has no complete lease");
    }
    return clone({
      jobId: job.id,
      operationKey: job.operationKey,
      kind: job.kind,
      payload: job.payload,
      attemptNumber: job.attemptCount,
      workerId: job.leaseOwner,
      leaseToken: job.leaseToken,
      leasedUntil: job.leasedUntil,
    });
  }

  #requireLeaseToken(lease: JobLease): MutableJob {
    const job = this.#jobs.get(lease.jobId);
    if (
      job === undefined ||
      job.status !== "leased" ||
      job.leaseToken !== lease.leaseToken ||
      job.leaseOwner !== lease.workerId ||
      job.attemptCount !== lease.attemptNumber
    ) {
      throw new JobLeaseError("lease is no longer active");
    }
    return job;
  }

  #requireLiveLease(lease: JobLease, atMs: number): MutableJob {
    const job = this.#requireLeaseToken(lease);
    if (
      job.leasedUntil === undefined ||
      toTimestamp(job.leasedUntil, "lease expiry") <= atMs
    ) {
      throw new JobLeaseError("lease has expired");
    }
    return job;
  }

  #activeAttempt(job: MutableJob): MutableAttempt {
    const attempt = this.#attempts.find(
      (candidate) =>
        candidate.jobId === job.id &&
        candidate.attemptNumber === job.attemptCount &&
        candidate.status === "evaluating",
    );
    if (attempt === undefined)
      throw new JobLeaseError("active attempt is missing");
    return attempt;
  }

  #finalizeActiveAttempt(job: MutableJob, at: string, code: string): void {
    this.#completeActiveAttempt(job, at, "failed", code);
  }

  #completeActiveAttempt(
    job: MutableJob,
    completedAt: string,
    status: "succeeded" | "failed",
    errorCode?: string,
    details?: Readonly<Record<string, JsonValue>>,
  ): void {
    const attempt = this.#activeAttempt(job);
    attempt.status = status;
    attempt.completedAt = completedAt;
    if (errorCode !== undefined) attempt.errorCode = errorCode;
    if (details !== undefined) attempt.details = clone(details);
    attempt.events.push({
      status,
      at: completedAt,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  }

  #clearLease(job: MutableJob): void {
    delete job.leaseOwner;
    delete job.leaseToken;
    delete job.leasedUntil;
  }

  #retryAt(job: MutableJob, atMs: number, leaseExpired: boolean): string {
    const configured = this.#retryDelayMs(job.attemptCount);
    if (!Number.isFinite(configured) || configured < 0) {
      throw new Error("retry delay must be a non-negative finite number");
    }
    const delay = leaseExpired
      ? Math.min(
          Math.max(configured, MIN_LEASE_EXPIRY_BACKOFF_MS),
          MAX_LEASE_EXPIRY_BACKOFF_MS,
        )
      : configured;
    return new Date(atMs + delay).toISOString();
  }
}
