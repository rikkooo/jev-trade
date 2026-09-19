import {
  getBlindStockPageBySymbol,
  getStockBySymbol,
  getUniverse,
} from "@/modules/view-model";

import { fixtureJson, publicNotFound } from "../../_lib/responses";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ symbol: string }> },
): Promise<Response> {
  const { symbol: rawSymbol } = await context.params;
  const symbol = rawSymbol.toUpperCase();
  const summary = getUniverse().find(
    (candidate) => candidate.symbol === symbol,
  );
  if (!summary) {
    return publicNotFound(
      "SYMBOL_NOT_FOUND",
      "Symbol is not in the fixture universe.",
    );
  }
  const projection = summary.blind
    ? getBlindStockPageBySymbol(symbol)
    : getStockBySymbol(symbol);
  if (!projection) {
    return publicNotFound(
      "SYMBOL_NOT_FOUND",
      "Symbol is not in the fixture universe.",
    );
  }
  return fixtureJson({ dataKind: "synthetic_fixture", summary, projection });
}
