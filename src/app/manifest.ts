import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

// Install metadata with the placeholder tile (dark ground, cream mark with a lime rule line).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name}: ${BRAND.slogan.replace(/\.$/, "")}`,
    short_name: BRAND.name,
    description: `${BRAND.tagline} Rule studio for stock-token agents on ${BRAND.chainName}.`,
    start_url: "/",
    display: "standalone",
    background_color: "#0f0f0e",
    theme_color: "#0f0f0e",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
