import type { MetadataRoute } from "next";

import { getPublicOrigin } from "@/modules/config/public-origin";
import {
  FIXTURE_AUDIT_FORECASTS,
  FIXTURE_FORECASTS,
} from "@/modules/view-model";

const publicPaths = [
  "",
  "/explore",
  "/portfolio",
  "/scorecard",
  "/methodology",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getPublicOrigin();
  const stockPaths = [...new Set(FIXTURE_FORECASTS.map(({ symbol }) => symbol))]
    .sort()
    .map((symbol) => `/stocks/${symbol.toLowerCase()}`);
  const forecastPaths = FIXTURE_AUDIT_FORECASTS.filter(
    ({ pickEligible }) => !pickEligible,
  ).map(({ id }) => `/forecasts/${encodeURIComponent(id)}`);

  return [...publicPaths, ...stockPaths, ...forecastPaths].map((path) => ({
    url: new URL(path || "/", origin).toString(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
