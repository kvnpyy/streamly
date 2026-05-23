import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
/**
 * Single-app root (`iptv-player/`). Do **not** point Turbopack/tracing at the parent folder:
 * the repo parent may contain a stray empty `package-lock.json`, which breaks dev chunk
 * URLs (404 / ChunkLoadError) and can produce 500s on `/_next/static/*` behind HTTPS proxy.
 */
const projectRoot = configDir;

function ipv4LanAddresses(): string[] {
  const out: string[] = [];
  try {
    const nets = os.networkInterfaces();
    for (const addrs of Object.values(nets)) {
      for (const a of addrs ?? []) {
        const fam = a.family;
        const v4 =
          fam === "IPv4" || (typeof fam === "number" && fam === 4);
        if (!v4 || a.internal) continue;
        out.push(a.address);
      }
    }
  } catch {
    /* noop */
  }
  return [...new Set(out)];
}

/**
 * Extra dev allowlist entries (origin **hostname** only — ports are stripped by Next).
 * Opening via `https://localhost:3443` still sends Origin host `localhost`; listing IPs
 * covers `https://<LAN-IP>:3443` from phones/TVs when NEXT_DEV_LAN_NO_AUTODISCOVER=1.
 */
const devExplicitLoopbackHosts = ["localhost", "127.0.0.1", "::1"] as const;

/**
 * Merge explicit NEXT_DEV_LAN_HOSTS with LAN IPv4s so phones & TVs work (disable LAN
 * autodiscovery via NEXT_DEV_LAN_NO_AUTODISCOVER=1).
 */
const devLanHosts =
  process.env.NODE_ENV === "development"
    ? [
        ...new Set([
          ...devExplicitLoopbackHosts,
          ...(process.env.NEXT_DEV_LAN_HOSTS?.split(/[\s,]+/) ?? [])
            .map((s) => s.trim())
            .filter(Boolean),
          ...(process.env.NEXT_DEV_EXTRA_ORIGINS?.split(/[\s,]+/) ?? [])
            .map((s) => s.trim())
            .filter(Boolean),
          ...(process.env.NEXT_DEV_LAN_NO_AUTODISCOVER === "1"
            ? []
            : ipv4LanAddresses()),
        ]),
      ]
    : [];

const noStoreDocument = [
  {
    key: "Cache-Control",
    value: "private, no-store, max-age=0, must-revalidate",
  },
] as const;

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  ...(devLanHosts.length > 0 ? { allowedDevOrigins: devLanHosts } : {}),
  /** Avoid stale HTML referencing old hashed chunks after `npm run build` (especially behind HTTPS proxy). */
  headers: async () => [
    { source: "/", headers: [...noStoreDocument] },
    { source: "/login", headers: [...noStoreDocument] },
    { source: "/app", headers: [...noStoreDocument] },
    { source: "/app/:path*", headers: [...noStoreDocument] },
  ],
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  /** Source map upload is optional; set SENTRY_AUTH_TOKEN + org/project in CI when ready. */
});
