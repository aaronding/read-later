import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";

// Installing the web app on Android adds it to the Share menu. Shared links
// arrive at /share; many apps put the link in "text" instead of "url".
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("Common");
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: t("tagline"),
    id: "/",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#1f6f5c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
