import type { MetadataRoute } from "next";
import { appUrl } from "@/config/env";
import { PUBLIC_PAGES } from "@/lib/search-engines";

// Written per request, since a Docker image is built without APP_URL.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({ url: `${appUrl()}${path}` }));
}
