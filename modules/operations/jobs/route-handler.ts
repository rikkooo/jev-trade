import { timingSafeEqual } from "node:crypto";

import type { InvocationReport } from "./runner";

export interface InternalCronConfig {
  readonly cronSecret?: string;
  readonly durableWrites: boolean;
  readonly now?: () => Date;
  readonly scheduleBucketMinutes?: number;
}

export type CronExecutor = (input: {
  readonly idempotencyKey: string;
}) => Promise<InvocationReport>;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function error(code: string, message: string, status: number): Response {
  return json({ ok: false, error: { code, message } }, status);
}

export async function handleInternalCronRequest(
  request: Request,
  config: InternalCronConfig,
  execute: CronExecutor,
): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = config.cronSecret ? `Bearer ${config.cronSecret}` : "";
  if (!expected || !safeEqual(authorization, expected)) {
    return error("UNAUTHORIZED", "Cron authorization failed.", 401);
  }
  if (request.method !== "GET") {
    return error("METHOD_NOT_ALLOWED", "Use GET for this endpoint.", 405);
  }
  if (request.headers.get("user-agent") !== "vercel-cron/1.0") {
    return error(
      "SCHEDULER_IDENTITY_REJECTED",
      "Scheduler identity is not allowed.",
      401,
    );
  }
  if (!config.durableWrites) {
    return error(
      "DURABLE_WRITES_DISABLED",
      "Scheduled mutations are disabled for this deployment.",
      503,
    );
  }
  try {
    const bucketMinutes = config.scheduleBucketMinutes ?? 15;
    if (!Number.isInteger(bucketMinutes) || bucketMinutes < 1) {
      throw new JobExecutionErrorForRoute("CRON_CONFIGURATION_INVALID");
    }
    const now = (config.now ?? (() => new Date()))();
    if (!Number.isFinite(now.getTime())) {
      throw new JobExecutionErrorForRoute("CRON_CONFIGURATION_INVALID");
    }
    const bucketMs = bucketMinutes * 60_000;
    const bucketStart = new Date(
      Math.floor(now.getTime() / bucketMs) * bucketMs,
    ).toISOString();
    const idempotencyKey = `vercel-cron:${new URL(request.url).pathname}:${bucketStart}`;
    const report = await execute({ idempotencyKey });
    return json({ ok: true, ...report }, 200);
  } catch (caught) {
    const code =
      caught instanceof JobExecutionErrorForRoute
        ? caught.code
        : "JOB_BACKEND_UNAVAILABLE";
    return error(code, "The scheduled invocation could not be started.", 503);
  }
}

export class JobExecutionErrorForRoute extends Error {
  constructor(readonly code: string) {
    super("The cron backend is unavailable.");
    this.name = "JobExecutionErrorForRoute";
  }
}
