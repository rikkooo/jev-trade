import type { MetadataRoute } from "next";

import { getPublicOrigin } from "@/modules/config/public-origin";

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/operator"],
    },
    sitemap: new URL("/sitemap.xml", origin).toString(),
  };
}
