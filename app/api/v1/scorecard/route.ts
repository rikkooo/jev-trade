import { FIXTURE_SCORECARD } from "@/modules/view-model";

import { fixtureJson } from "../_lib/responses";

export const dynamic = "force-dynamic";

const VALID_MODES = new Set(["POSITION", "SPRINT"]);
const VALID_HORIZONS = new Set(["1", "5", "20"]);

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  const mode = search.get("mode")?.toUpperCase() ?? null;
  const horizon = search.get("horizon") ?? null;
  if (
    (mode && !VALID_MODES.has(mode)) ||
    (horizon && !VALID_HORIZONS.has(horizon))
  ) {
    return Response.json(
      {
        error: {
          code: "INVALID_SCORECARD_FILTER",
          message:
            "Mode must be POSITION or SPRINT and horizon must be 1, 5, or 20.",
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  return fixtureJson({
    dataKind: "synthetic_fixture",
    filters: { mode, horizon: horizon === null ? null : Number(horizon) },
    scorecard: FIXTURE_SCORECARD,
  });
}
