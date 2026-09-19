import { getServerEnv } from "@/modules/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const env = getServerEnv();
  return Response.json(
    {
      status: "ready",
      mode: env.APP_MODE,
      capabilities: {
        database: Boolean(env.DATABASE_URL),
        durableWrites: env.DURABLE_WRITES,
        publicMarketData: env.PUBLIC_MARKET_DATA,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
