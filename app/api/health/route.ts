import { getServerEnv } from "@/modules/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const env = getServerEnv();

  return Response.json(
    {
      status: "ok",
      service: "jev-trade",
      mode: env.APP_MODE,
      capabilities: {
        database: Boolean(env.DATABASE_URL),
        durableWrites: env.DURABLE_WRITES,
        publicMarketData: env.PUBLIC_MARKET_DATA,
        liveJudgments:
          env.APP_MODE === "live" && Boolean(env.OPENROUTER_API_KEY),
      },
      fixtureSafety: {
        credentialFree: ![
          env.DATABASE_URL,
          env.DATABASE_MIGRATION_URL,
          env.OPENROUTER_API_KEY,
          env.AI_GATEWAY_API_KEY,
          env.CRON_SECRET,
          env.MARKET_DATA_API_KEY,
          env.OPERATOR_TOKEN,
        ].some(Boolean),
      },
      deployment: {
        environment: env.VERCEL_ENV ?? "local",
        revision: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "development",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
