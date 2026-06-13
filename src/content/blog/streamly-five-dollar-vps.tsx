import { BlogArticleBody, BlogProTip } from "@/components/blog/BlogShell";
import Link from "next/link";
import type { BlogPostMeta } from "@/lib/blog/types";

export const meta: BlogPostMeta = {
  slug: "streamly-five-dollar-vps",
  title: "Running Streamly on a $5 VPS (Real Numbers + Tips)",
  description:
    "What iptvwebplayer.org actually costs to run — RAM, disk, build times, bandwidth, backups, and the mistakes that eat your cheap VPS alive.",
  publishedAt: "2026-06-11",
  readingMinutes: 9,
  keywords: [
    "cheap VPS IPTV",
    "self-hosted IPTV cost",
    "Streamly hosting",
    "Next.js VPS deploy",
    "Docker IPTV server",
  ],
};

export function StreamlyFiveDollarVpsContent() {
  return (
    <BlogArticleBody>
      <p className="text-lg text-(--text) leading-relaxed">
        Everyone says you can host &quot;anything&quot; on a $5 VPS. Fewer people
        show the invoice <em>and</em> the <code>htop</code> screenshot.{" "}
        <a href="https://iptvwebplayer.org">iptvwebplayer.org</a> runs on a
        small Linux VM — not a Kubernetes cluster, not a managed Next.js
        platform. Here are the real numbers and the tips I wish I&apos;d known
        before the first OOM kill.
      </p>

      <p>
        This isn&apos;t a provider ad. Prices move. The shape of the bill
        doesn&apos;t: compute, disk, bandwidth, domain, email. Add those up and
        decide if self-hosting beats using the public instance for free.
      </p>

      <h2>The bill (monthly, rounded)</h2>
      <ul>
        <li>
          <strong>VPS (1 vCPU, 2 GB RAM, 40–50 GB SSD)</strong> — about{" "}
          <strong>$5–7/mo</strong> on common budget hosts (Hetzner CX22-class,
          Vultr/DO entry tiers, etc.). I wouldn&apos;t go below 2 GB RAM for
          production Next builds.
        </li>
        <li>
          <strong>Domain</strong> — ~<strong>$12/year</strong> amortized (~$1/mo)
          if you care about a clean URL instead of a raw IP.
        </li>
        <li>
          <strong>Email (Resend)</strong> — free tier covers early transactional
          volume (verification, password reset). Marketing broadcasts are
          separate math.
        </li>
        <li>
          <strong>TMDB + discovery APIs</strong> — free tiers; optional niceties,
          not required to watch TV.
        </li>
      </ul>
      <p>
        <strong>All-in for a personal or small-family deployment:</strong> often{" "}
        <strong>$6–10/month</strong> depending on whether you already own the
        domain. The public Streamly site adds GA4 and Sentry — still pennies
        next to the VM.
      </p>

      <h2>What the box is actually doing</h2>
      <p>
        One Node process (<code>next start</code> on port 3000), SQLite on disk,
        optional ffmpeg when VOD transcode is enabled, nginx or Caddy on the host
        for TLS. No Redis, no Postgres, no worker fleet. That simplicity is why
        a cheap VPS works.
      </p>
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-[13px] leading-relaxed text-(--text-dim) font-mono">
        {`Typical steady state (1–3 household viewers):
  RAM:  ~400–900 MB for Node + page cache
  CPU:  low idle; spikes on deploy build + transcode jobs
  Disk: ~2 GB app + node_modules; SQLite < 100 MB early on
  Net:  egress-heavy when YOU watch (streams proxy through the box)`}
      </pre>

      <h2>Real numbers from deploy day</h2>
      <p>
        These are representative of what I see on the production host — your
        mileage varies with provider panel size and concurrent viewers:
      </p>
      <ul>
        <li>
          <code>npm ci</code> — ~600 packages, ~15–20 seconds on a 1 vCPU VPS.
        </li>
        <li>
          <code>next build --webpack</code> — ~45–60 seconds with 3 workers;
          that&apos;s the spike that hurts on 1 GB RAM machines.
        </li>
        <li>
          Cold start after restart — a few seconds to listen on{" "}
          <code>:3000</code>; health check at <code>/api/health</code> goes green
          immediately after.
        </li>
        <li>
          SQLite <code>db:push</code> — sub-second when schema is current.
        </li>
      </ul>
      <p>
        I deploy with rsync + remote build (see <code>npm run deploy:vps</code>{" "}
        in the repo). Full deploy is ~2–3 minutes end-to-end; quick deploys
        skip <code>npm ci</code> when lockfile didn&apos;t change.
      </p>

      <BlogProTip>
        <p>
          Run builds on the VPS only when RAM ≥ 2 GB, or build in CI and ship
          the <code>.next</code> artifact. A 1 GB box during{" "}
          <code>next build</code> is how you meet the OOM killer.
        </p>
      </BlogProTip>

      <h2>Bandwidth — the hidden line item</h2>
      <p>
        Streamly proxies IPTV streams through <code>/api/stream</code> so
        browsers can play them. That means <strong>video bytes count against
        your VPS egress</strong>, not just HTML and JSON.
      </p>
      <ul>
        <li>
          Browsing catalogs, EPG, posters — negligible (tens of MB/day for
          active development).
        </li>
        <li>
          One HD live channel — often 2–5 Mbps sustained → roughly{" "}
          <strong>1–2 GB/hour</strong> per stream through the proxy.
        </li>
        <li>
          Three family members watching different channels — multiply.
        </li>
      </ul>
      <p>
        Budget VPS plans often include 1–2 TB/month. For{" "}
        <strong>personal use</strong> you&apos;re usually fine. For{" "}
        <strong>public multi-tenant hosting</strong> you are not — that&apos;s a
        different product and a different bill.
      </p>

      <h2>Disk and SQLite hygiene</h2>
      <p>
        The database stays small early: users, favorites, watch progress,
        encrypted provider rows. Schedule backups:
      </p>
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-[13px] leading-relaxed text-(--text-dim) font-mono">
        {`npm run db:backup   # copies stream.db with a timestamp`}
      </pre>
      <p>
        Keep at least one copy off the VPS (object storage, another machine,
        boring NAS folder). Cron examples live in{" "}
        <code>scripts/crontab.example</code>. If you enable VOD transcode,
        budget extra disk for ffmpeg cache — that grows faster than SQLite.
      </p>

      <h2>What I configure on the host</h2>
      <ol>
        <li>
          <strong>TLS reverse proxy</strong> — Caddy or nginx terminating HTTPS,
          proxying to <code>127.0.0.1:3000</code>. Non-negotiable for cookies
          and mixed content.
        </li>
        <li>
          <strong>systemd unit</strong> — restart on failure, start on boot
          (<code>npm run app:install</code> / <code>app:autostart</code>{" "}
          helpers in the repo).
        </li>
        <li>
          <strong>Firewall</strong> — expose 80/443 only; Node stays on
          localhost.
        </li>
        <li>
          <strong>Secrets in <code>.env</code></strong> —{" "}
          <code>AUTH_SECRET</code>, <code>STREAM_SESSION_SECRET</code>, Resend
          keys. Never commit them; deploy scripts preserve the server{" "}
          <code>.env</code>.
        </li>
        <li>
          <strong>Rollback snapshot</strong> — deploy script copies the previous
          tree before swapping; health check fails → automatic restore.
        </li>
      </ol>

      <h2>When a $5 VPS is enough</h2>
      <ul>
        <li>You + partner + kids, mostly one stream at a time.</li>
        <li>You&apos;re okay SSHing for updates.</li>
        <li>You want data and credentials on your metal.</li>
        <li>You&apos;re not trying to run a reseller business off the same box.</li>
      </ul>

      <h2>When to spend more (or don&apos;t self-host)</h2>
      <ul>
        <li>
          <strong>Always-on transcode</strong> for heavy MKV libraries — CPU is
          the bottleneck, not RAM.
        </li>
        <li>
          <strong>Many concurrent viewers</strong> through one proxy — upgrade
          bandwidth and CPU, or split stream proxy from app server.
        </li>
        <li>
          <strong>Zero ops</strong> — use{" "}
          <a href="https://iptvwebplayer.org">iptvwebplayer.org</a> and spend
          the $5 on coffee.
        </li>
      </ul>

      <h2>Quick start if you&apos;re convinced</h2>
      <p>
        Spin up Ubuntu 22.04/24.04, install Docker, clone{" "}
        <a href="https://github.com/kvnpyy/streamly">Streamly</a>, follow the{" "}
        <Link href="/blog/how-to-self-host-streamly">Docker setup guide</Link>.
        For the &quot;why does this architecture exist&quot; story, read{" "}
        <Link href="/blog/nextjs-iptv-weekend-build">
          how I built the frontend in a weekend
        </Link>
        .
      </p>

      <h2>Bottom line</h2>
      <p>
        A <strong>$5–7 VPS</strong> comfortably runs Streamly for personal IPTV
        if you respect RAM during builds and understand that{" "}
        <strong>proxied video eats bandwidth</strong>. My production bill is
        boring on purpose: small VM, SQLite, single Node process, nightly DB
        backup, rsync deploys. That&apos;s the whole secret.
      </p>

      <p className="text-sm border-t border-white/10 pt-6 mt-10">
        <strong className="text-(--text)">Disclaimer:</strong> Streamly is a
        player only. It does not sell IPTV subscriptions or host licensed
        content. You are responsible for your provider and local law.
      </p>
    </BlogArticleBody>
  );
}
