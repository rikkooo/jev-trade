import { getForecastById } from "@/modules/view-model";

import { fixtureJson, publicNotFound } from "../../_lib/responses";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const forecast = getForecastById(id);
  if (!forecast || forecast.pickEligible) {
    return publicNotFound(
      "FORECAST_NOT_FOUND",
      "Forecast is unavailable on the public audit route.",
    );
  }
  return fixtureJson({ dataKind: "synthetic_fixture", forecast });
}
