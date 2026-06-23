import { NextResponse } from "next/server";

/**
 * Digital Asset Links for Android TV Trusted Web Activity.
 * Set ANDROID_TWA_SHA256_FINGERPRINTS (comma-separated) after generating your signing key.
 */
export function GET() {
  const packageName =
    process.env.ANDROID_TWA_PACKAGE_NAME?.trim() || "org.streamly.iptv";
  const fingerprints = (process.env.ANDROID_TWA_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (fingerprints.length === 0) {
    return new NextResponse("Not configured", { status: 404 });
  }

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
