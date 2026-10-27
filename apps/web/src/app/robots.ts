import type { MetadataRoute } from "next";
import { appUrl } from "@/config/env";
import { DISALLOWED_PATHS } from "@/lib/search-engines";

// Written per request, since a Docker image is built without APP_URL.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: DISALLOWED_PATHS },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
