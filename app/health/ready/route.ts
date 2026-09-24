import { getServerEnv, RUNTIME_DATABASE_URL_KEYS } from "@/modules/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const env = getServerEnv();
  return Response.json(
    {
      status: "ready",
      mode: env.APP_MODE,
      capabilities: {
        database: RUNTIME_DATABASE_URL_KEYS.every((key) => Boolean(env[key])),
        durableWrites: env.DURABLE_WRITES,
        publicMarketData: env.PUBLIC_MARKET_DATA,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
