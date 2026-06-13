import { BlogArticleBody, BlogProTip } from "@/components/blog/BlogShell";
import Link from "next/link";
import type { BlogPostMeta } from "@/lib/blog/types";

export const meta: BlogPostMeta = {
  slug: "nextjs-iptv-weekend-build",
  title:
    "How I Built a Full IPTV Frontend with Next.js 16 + Docker in One Weekend",
  description:
    "A honest build log — Next.js 16, React 19, HLS.js, Xtream proxy, SQLite, and Docker — for a browser IPTV player that actually ships.",
  publishedAt: "2026-06-13",
  readingMinutes: 10,
  keywords: [
    "Next.js 16 IPTV",
    "IPTV web player",
    "React 19 streaming",
    "HLS.js browser player",
    "Xtream Codes frontend",
    "Docker IPTV",
  ],
};

export function NextjsIptvWeekendBuildContent() {
  return (
    <BlogArticleBody>
      <p className="text-lg text-(--text) leading-relaxed">
        I didn&apos;t set out to build an IPTV platform. I set out to stop
        fighting five different apps on five different screens. One long
        weekend later I had a working{" "}
        <a href="https://iptvwebplayer.org">Streamly</a> tab — live TV, movies,
        series, EPG, a custom player, TV-browser layout, and a Docker image I
        could hand to friends. This is how that weekend was actually spent, not
        a LinkedIn carousel version.
      </p>

      <p>
        The stack is boring on purpose: <strong>Next.js 16</strong>,{" "}
        <strong>React 19</strong>, <strong>Tailwind CSS v4</strong>,{" "}
        <strong>HLS.js</strong>, <strong>Zustand</strong>,{" "}
        <strong>TanStack Query</strong>, <strong>SQLite</strong> via Drizzle,
        and <strong>Docker</strong> for deployment. Boring stacks ship.
      </p>

      <h2>Friday night: make one channel play in a browser</h2>
      <p>
        The first blocker wasn&apos;t UI — it was physics. Browsers don&apos;t
        let you point a <code>&lt;video&gt;</code> tag at a random Xtream{" "}
        <code>.m3u8</code> URL from another domain and call it a day. CORS,
        mixed content, and tokenized URLs kill naive approaches fast.
      </p>
      <p>
        So the first real commit was two API routes:
      </p>
      <ul>
        <li>
          <code>/api/xtream</code> — JSON proxy to{" "}
          <code>player_api.php</code> with credentials in headers, not the
          query string.
        </li>
        <li>
          <code>/api/stream</code> — media proxy that rewrites HLS manifests so
          segment URLs loop back through your origin.
        </li>
      </ul>
      <p>
        Once one live channel played in Chrome without opening DevTools every
        thirty seconds, I let myself touch CSS. That rule saved the weekend.
      </p>

      <BlogProTip>
        <p>
          If your IPTV web player can&apos;t proxy streams, you&apos;ll spend
          the next month explaining why Safari works on Tuesday and not
          Wednesday. Fix playback plumbing before you design a hero section.
        </p>
      </BlogProTip>

      <h2>Saturday morning: Xtream as a typed client, not a junk drawer</h2>
      <p>
        Xtream panels speak a deceptively simple API: categories, streams, VOD,
        series, EPG actions. The pain is inconsistency — missing fields, numeric
        category names, series payloads that look different panel to panel.
      </p>
      <p>
        I wrapped everything in <code>src/lib/xtream.ts</code>: one{" "}
        <code>call()</code> function hitting our proxy, plus helpers like{" "}
        <code>liveCatalogBundle()</code> and <code>vodCatalogBundle()</code> that
        merge categories with streams on the server when possible. That cut
        initial live-page load from &quot;download half the panel&quot; to
        &quot;fetch what the shelf needs.&quot;
      </p>
      <p>
        M3U support came later the same day — same login screen, different tab.
        Some providers only hand you a URL. Fine. Parse it, don&apos;t preach.
      </p>

      <h2>Saturday afternoon: the player (where weekends usually die)</h2>
      <p>
        I could have embedded Video.js and moved on. I didn&apos;t, because IPTV
        isn&apos;t a single MP4 — it&apos;s live HLS, VOD HLS, occasional
        weird codecs, stall recovery, and &quot;why is there no audio on this
        channel but the next one is fine.&quot;
      </p>
      <p>
        <code>Player.tsx</code> grew into a proper overlay: seek bar, audio
        tracks where the manifest exposes them, playback speed for VOD, EPG
        drawer on live, cast hooks, and a transcode fallback path when the
        browser can&apos;t decode what the provider sent (common with MKV/HEVC).
      </p>
      <p>
        HLS.js on desktop, native HLS where it&apos;s better (hello iOS live
        AC-3 quirks), and a server-side ffmpeg transcode lane for the stubborn
        stuff. Not glamorous. Very IPTV.
      </p>

      <h2>Saturday evening: catalogs that don&apos;t melt the tab</h2>
      <p>
        A full live category list can be tens of thousands of channels. Rendering
        that as React cards is how you learn what &quot;main thread long
        task&quot; means in production.
      </p>
      <p>
        Fixes that actually mattered:
      </p>
      <ul>
        <li>
          <strong>TanStack Virtual</strong> for channel grids and episode lists.
        </li>
        <li>
          Server-built live/VOD catalogs (<code>/api/live/catalog</code>,{" "}
          <code>/api/vod/catalog</code>) so the browser isn&apos;t parsing
          megabytes of JSON on a phone.
        </li>
        <li>
          Shelf-based browsing (Netflix-style rows) instead of one infinite grid
          on first paint.
        </li>
        <li>
          EPG with a three-tier fallback: provider short EPG → full schedule →
          public XMLTV when the channel name gives us a country hint.
        </li>
      </ul>

      <h2>Sunday: auth, SQLite, and &quot;oh right, production&quot;</h2>
      <p>
        Personal-use IPTV could stay client-only forever. I wanted optional{" "}
        <strong>Streamly accounts</strong> — save providers encrypted, sync
        favorites, TV pairing — so Sunday was Drizzle + SQLite + Auth.js
        (NextAuth v5 beta, because I live dangerously).
      </p>
      <p>
        SQLite is the right call for a single-node IPTV frontend: one file,
        easy backups, no Postgres babysitting on a $5 box. Migrations via{" "}
        <code>drizzle-kit push</code>. Done.
      </p>
      <p>
        Resend for verification email, Turnstile on first Xtream probe, rate
        limits on auth routes, HttpOnly cookies for IPTV sessions — the unsexy
        checklist that keeps a public URL from becoming a credential honeypot.
      </p>

      <h2>Sunday night: Docker and the first real deploy</h2>
      <p>
        <code>docker compose up</code> with a named volume for{" "}
        <code>data/stream.db</code>, environment secrets from <code>.env</code>,
        port 3000 behind nginx/Caddy on the host. The Dockerfile is
        multi-stage: install, build, run as a slim production image.
      </p>
      <p>
        First VPS build took longer than my laptop (expected). Health check at{" "}
        <code>/api/health</code>, systemd unit, rsync deploy script for later
        pushes. I wrote the longer Docker guide after I’d already broken
        production twice — see the{" "}
        <Link href="/blog/how-to-self-host-streamly">self-host post</Link> if
        you want the polished version.
      </p>

      <h2>What I deliberately did not build that weekend</h2>
      <ul>
        <li>A reseller panel or playlist marketplace (never).</li>
        <li>Native iOS/Android apps — it&apos;s a URL; TV browsers exist.</li>
        <li>Real-time chat, social features, or a blockchain anything.</li>
        <li>Perfect EPG for every channel on earth — heuristics + fallbacks won.</li>
      </ul>
      <p>
        Scope is a feature. The goal was a calm{" "}
        <strong>IPTV web player</strong> I&apos;d actually open after work.
      </p>

      <h2>The stack today (if you&apos;re cloning the repo)</h2>
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-[13px] leading-relaxed text-(--text-dim) font-mono">
        {`Next.js 16 · React 19 · Tailwind v4
HLS.js · Zustand · TanStack Query + Virtual
Drizzle ORM · better-sqlite3 · NextAuth v5
Framer Motion · Vitest · Sentry (optional)`}
      </pre>
      <p>
        Source is on{" "}
        <a href="https://github.com/kvnpyy/streamly">GitHub</a> (MIT). The
        public instance at{" "}
        <a href="https://iptvwebplayer.org">iptvwebplayer.org</a> runs the same
        tree I deploy from my laptop.
      </p>

      <h2>Could you do this in a weekend?</h2>
      <p>
        A <em>minimal</em> player — login, one grid, proxied HLS — yes, if
        you&apos;ve done video on the web before. <em>This</em> feature set
        (live shelves, VOD detail pages, TV mode, EPG, accounts, transcode
        fallback) is a hungry weekend plus a few evenings the following week for
        polish. I&apos;m not selling a course; I&apos;m saying the architecture
        is what made iteration fast: proxy first, typed Xtream client, virtual
        lists, SQLite, Docker.
      </p>
      <p>
        Hosting costs? That&apos;s the next post —{" "}
        <Link href="/blog/streamly-five-dollar-vps">running Streamly on a $5 VPS</Link>{" "}
        with real numbers from the box that serves iptvwebplayer.org.
      </p>

      <p className="text-sm border-t border-white/10 pt-6 mt-10">
        <strong className="text-(--text)">Disclaimer:</strong> Streamly is a
        media player. It does not provide channels or copyrighted content. You
        need your own IPTV subscription and must follow applicable law.
      </p>
    </BlogArticleBody>
  );
}
