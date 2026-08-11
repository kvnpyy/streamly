import { BrandMarkImage } from "@/lib/brand-mark-image";
import { SITE_NAME } from "@/lib/site-brand";
import { ImageResponse } from "next/og";

export const alt = "Streamly — Modern IPTV Web Player for Xtream Codes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background: "linear-gradient(145deg, #06070b 0%, #11141c 45%, #1a1035 100%)",
          color: "#eef0f6",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 36,
          }}
        >
          <BrandMarkImage size={72} radius={18} />
          <span style={{ fontSize: 36, fontWeight: 700 }}>{SITE_NAME}</span>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: -2,
            maxWidth: 980,
          }}
        >
          Modern IPTV Web Player for Xtream Codes
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#9aa0b3",
            marginTop: 24,
            maxWidth: 820,
            lineHeight: 1.35,
          }}
        >
          Live TV, movies & series in your browser. Xtream Codes & M3U.
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 22,
            color: "#00e0c6",
            fontWeight: 600,
          }}
        >
          iptvwebplayer.org
        </div>
      </div>
    ),
    { ...size }
  );
}
