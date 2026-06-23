import { NextResponse } from "next/server";

/** Samsung Smart Hub public preview feed — referenced from tv-apps/tizen/config.xml */
export function GET() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://iptvwebplayer.org";
  const expires = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const body = {
    expires,
    sections: [
      {
        title: "Streamly",
        position: 0,
        tiles: [
          {
            title: "Sign in",
            subtitle: "Connect your IPTV subscription",
            image_url: `${base}/pwa-icon/512`,
            image_ratio: "1by1",
            action_data: JSON.stringify({ path: "/login" }),
            is_playable: false,
            position: 0,
          },
          {
            title: "TV setup",
            subtitle: "PIN pairing and install help",
            image_url: `${base}/opengraph-image`,
            image_ratio: "16by9",
            action_data: JSON.stringify({ path: "/tv" }),
            is_playable: false,
            position: 1,
          },
        ],
      },
    ],
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
