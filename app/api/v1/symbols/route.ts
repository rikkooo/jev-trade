import { getUniverse } from "@/modules/view-model";

import { fixtureJson } from "../_lib/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams
    .get("query")
    ?.trim()
    .toUpperCase();
  const symbols = getUniverse().filter(
    (symbol) =>
      !query ||
      symbol.symbol.includes(query) ||
      symbol.company.toUpperCase().includes(query),
  );
  return fixtureJson({ dataKind: "synthetic_fixture", symbols });
}
