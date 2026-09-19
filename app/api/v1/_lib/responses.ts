import { NextResponse } from "next/server";

export const FIXTURE_READ_CACHE_CONTROL =
  "public, max-age=60, stale-while-revalidate=300";

export function fixtureJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": FIXTURE_READ_CACHE_CONTROL },
  });
}

export function publicNotFound(code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
