import { getServerEnv } from "@/modules/config/env";
import {
  handleInternalCronRequest,
  JobExecutionErrorForRoute,
} from "@/modules/operations/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const env = getServerEnv();
  return handleInternalCronRequest(
    request,
    {
      cronSecret: env.CRON_SECRET,
      durableWrites: env.DURABLE_WRITES,
    },
    async () => {
      // The fixture deployment has no durable queue adapter. Enabling writes
      // without installing the database-backed adapter must remain fail closed.
      throw new JobExecutionErrorForRoute("JOB_BACKEND_UNAVAILABLE");
    },
  );
}
