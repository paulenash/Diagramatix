import type { MetadataRoute } from "next";

// Robots for app.diagramatix.com.au. Note: the www landing site is expected
// to become the canonical marketing property — when that lands, the marketing
// routes here should be noindexed (or redirected) in favour of www.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api", "/m"],
      },
    ],
    sitemap: "https://app.diagramatix.com.au/sitemap.xml",
  };
}
