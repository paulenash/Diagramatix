import type { MetadataRoute } from "next";

// Sitemap covers the public marketing routes only. Note: the www landing site
// is expected to become the canonical marketing property — revisit this (and
// robots.ts) once that migration happens.
const BASE_URL = "https://app.diagramatix.com.au";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/pricing", "/about", "/features", "/terms", "/privacy"];
  return routes.map((route) => ({
    url: `${BASE_URL}${route === "/" ? "" : route}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
