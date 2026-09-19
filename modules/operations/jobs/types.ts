import type { JsonValue } from "@/modules/ledger/canonical-json";

export type JobKind =
  | "eod_evaluation"
  | "position_monitor"
  | "outcome_resolution"
  | "correction_replay";

export type JobStatus =
  "queued" | "leased" | "retryable" | "succeeded" | "dead_letter";

export interface JobOperation {
  readonly id: string;
  readonly operationKey: string;
  readonly kind: JobKind;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly payloadHash: string;
  readonly status: JobStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly scheduledAt: string;
  readonly availableAt: string;
  readonly replayOfOperationId?: string;
  readonly leaseOwner?: string;
  readonly leaseToken?: string;
  readonly leasedUntil?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobAttemptRecord {
  readonly id: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly workerId: string;
  readonly status: "evaluating" | "succeeded" | "failed";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly errorCode?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
  readonly events: readonly JobAttemptEventRecord[];
}

export interface JobAttemptEventRecord {
  readonly status: "scheduled" | "evaluating" | "succeeded" | "failed";
  readonly at: string;
  readonly errorCode?: string;
}

export interface JobLease {
  readonly jobId: string;
  readonly operationKey: string;
  readonly kind: JobKind;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly attemptNumber: number;
  readonly workerId: string;
  readonly leaseToken: string;
  readonly leasedUntil: string;
}

export interface EnqueueJobInput {
  readonly operationKey: string;
  readonly kind: JobKind;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly availableAt: string;
  readonly maxAttempts: number;
  readonly replayOfOperationId?: string;
}

export interface EnqueueResult {
  readonly created: boolean;
  readonly job: JobOperation;
}

export interface ClaimJobInput {
  readonly workerId: string;
  readonly now: string;
  readonly leaseMs: number;
}

export interface JobFailureInput {
  readonly at: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, JsonValue>>;
}

export interface OperatorReplayInput {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly requestedBy: string;
  readonly reason: string;
  readonly now: string;
}

export interface JobQueue {
  enqueue(input: EnqueueJobInput): EnqueueResult;
  claim(input: ClaimJobInput): JobLease | null;
  heartbeat(input: {
    readonly lease: JobLease;
    readonly now: string;
    readonly leaseMs: number;
  }): JobLease;
  succeed(lease: JobLease, at: string): JobOperation;
  fail(lease: JobLease, failure: JobFailureInput): JobOperation;
  release(lease: JobLease, at: string, errorCode?: string): JobOperation;
  operatorReplay(input: OperatorReplayInput): EnqueueResult;
  get(id: string): JobOperation | undefined;
  getByOperationKey(operationKey: string): JobOperation | undefined;
  list(): readonly JobOperation[];
  attempts(jobId: string): readonly JobAttemptRecord[];
}
