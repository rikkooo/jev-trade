import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "DURABLE_WRITES_DISABLED",
        message: "Fixture picks are stored only in this browser.",
      },
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
