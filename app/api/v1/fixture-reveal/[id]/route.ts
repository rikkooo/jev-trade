import { NextResponse } from "next/server";

import { getForecastById } from "@/modules/view-model";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const forecast = getForecastById(id);
  if (!forecast || !forecast.pickEligible) {
    return NextResponse.json(
      {
        error: {
          code: "FIXTURE_REVEAL_NOT_FOUND",
          message: "Fixture reveal is unavailable.",
        },
      },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    { forecast },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
