import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} IPTV Web Player`,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: "/login",
    display: "standalone",
    background_color: "#06070b",
    theme_color: "#06070b",
    orientation: "any",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
