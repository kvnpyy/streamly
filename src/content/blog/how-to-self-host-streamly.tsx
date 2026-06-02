import { BlogArticleBody, BlogProTip } from "@/components/blog/BlogShell";
import type { BlogPostMeta } from "@/lib/blog/types";

export const meta: BlogPostMeta = {
  slug: "how-to-self-host-streamly",
  title:
    "How to Self-Host Streamly: My Docker Setup for a Clean IPTV Web Player in 2026",
  description:
    "A practical Docker Compose guide to self-host Streamly — a calm browser IPTV web player for Xtream Codes and M3U playlists, with persistent SQLite and sane secrets.",
  publishedAt: "2026-05-23",
  readingMinutes: 8,
  keywords: [
    "self-hosted IPTV player",
    "Streamly Docker",
    "IPTV web player",
    "Xtream Codes",
    "Docker Compose IPTV",
  ],
};

export function HowToSelfHostStreamlyContent() {
  return (
    <BlogArticleBody>
      <p className="text-lg text-(--text) leading-relaxed">
        I got tired of installing yet another IPTV app on every screen in the
        house — phone, tablet, TV box, laptop — and none of them felt the same.
        So I built{" "}
        <a href="https://iptvwebplayer.org">Streamly</a>, a browser-based IPTV
        web player you can run yourself. No app store. No weird APK sideload.
        Just a URL.
      </p>

      <p>
        If you already have an Xtream login or an M3U playlist from your
        provider, self-hosting Streamly gives you a single, calm interface for
        live TV, movies, and series. This post is the Docker setup I actually
        run — not theory, not a vendor doc rewrite.
      </p>

      <h2>Why self-host an IPTV web player at all?</h2>
      <p>
        Hosted SaaS players are fine until they aren&apos;t: domain changes,
        ads, feature churn, or privacy questions about where your playlist
        credentials live. A self-hosted IPTV player lives on{" "}
        <em>your</em> machine or VPS. You control updates, backups, and who can
        reach it.
      </p>
      <p>
        Streamly is MIT-licensed and on{" "}
        <a href="https://github.com/kvnpyy/streamly">GitHub</a>. I use it
        because I wanted something that loads fast in Safari, doesn&apos;t look
        like a 2012 Kodi skin, and treats Xtream Codes as a first-class citizen
        — not an afterthought next to a janky M3U import.
      </p>

      <h2>What you need before Docker</h2>
      <ul>
        <li>
          <strong>Docker</strong> and <strong>Docker Compose</strong> on a
          Linux box, NAS, or home server (2 GB RAM is plenty for a household).
        </li>
        <li>
          Your own <strong>Xtream portal URL + username + password</strong>, or
          an <strong>M3U / M3U8 URL</strong> from your provider. Streamly does
          not sell or supply streams.
        </li>
        <li>
          A domain (optional but nice) with HTTPS — Caddy, Traefik, or nginx on
          the host in front of port 3000.
        </li>
      </ul>

      <h2>My docker-compose.yml (the short version)</h2>
      <p>
        Clone the repo, copy <code>.env.example</code> to <code>.env</code>, and
        fill in secrets. The compose file in the repo looks like this:
      </p>
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-[13px] leading-relaxed text-(--text-dim) font-mono">
        {`services:
  streamly:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - streamly_data:/app/data
    environment:
      AUTH_SECRET: \${AUTH_SECRET}
      STREAM_SESSION_SECRET: \${STREAM_SESSION_SECRET}
      DATABASE_URL: file:/app/data/stream.db

volumes:
  streamly_data:`}
      </pre>
      <p>
        The important bit is the <code>streamly_data</code> volume. That&apos;s
        where SQLite lives — accounts, favorites, watch progress. Blow away the
        container without the volume and you&apos;ll wonder where your settings
        went. (Ask me how I know.)
      </p>

      <h2>Step-by-step: first boot</h2>
      <ol>
        <li>
          <code>git clone https://github.com/kvnpyy/streamly.git</code> and{" "}
          <code>cd streamly</code> (or whatever you named the folder).
        </li>
        <li>
          Generate secrets:{" "}
          <code>openssl rand -base64 32</code> — use one output for{" "}
          <code>AUTH_SECRET</code> and another for{" "}
          <code>STREAM_SESSION_SECRET</code>.
        </li>
        <li>
          Set <code>NEXT_PUBLIC_SITE_URL</code> to your public URL (e.g.{" "}
          <code>https://tv.yourdomain.com</code>) so canonical links and the
          sitemap are correct.
        </li>
        <li>
          <code>docker compose up -d --build</code> — first build takes a few
          minutes; after that it&apos;s cached.
        </li>
        <li>
          Open <code>http://your-server:3000</code>, create a Streamly account
          if you want cloud sync for favorites, then sign in with your Xtream or
          M3U credentials.
        </li>
      </ol>

      <BlogProTip>
        <p>
          Put Streamly behind a reverse proxy with HTTPS before you share the
          URL with family. Browsers are picky about media APIs on plain HTTP,
          and you really don&apos;t want playlist passwords crossing the internet
          unencrypted.
        </p>
      </BlogProTip>

      <h2>Environment variables I actually set</h2>
      <ul>
        <li>
          <code>AUTH_SECRET</code> — required for Stream account sign-in
          (Auth.js).
        </li>
        <li>
          <code>STREAM_SESSION_SECRET</code> — encrypts the HttpOnly session
          that holds your IPTV login between page loads.
        </li>
        <li>
          <code>DATABASE_URL</code> — keep the default{" "}
          <code>file:/app/data/stream.db</code> inside the volume.
        </li>
        <li>
          <code>RESEND_API_KEY</code> + <code>EMAIL_FROM</code> — only if you
          want email verification and password reset on your instance.
        </li>
        <li>
          <code>TMDB_API_TOKEN</code> — optional; nicer posters on live
          channels when EPG titles match.
        </li>
      </ul>
      <p>
        I leave <code>NEXT_PUBLIC_GA_MEASUREMENT_ID</code> empty on self-hosted
        installs. No analytics phone-home on a box I own.
      </p>

      <h2>Updates and backups</h2>
      <p>
        To update: <code>git pull</code>, then{" "}
        <code>docker compose up -d --build</code>. Your data volume survives.
        For backups, copy <code>/app/data/stream.db</code> from the volume (or
        use the <code>npm run db:backup</code> script on a dev checkout). I do
        this weekly to a boring old folder on my NAS.
      </p>

      <h2>Who is this for?</h2>
      <p>
        Homelab folks, expats sharing one server with family, anyone who already
        pays for IPTV and wants a clean <strong>self-hosted IPTV player</strong>{" "}
        instead of fifteen different apps. It&apos;s not a magic wand — you
        still need a lawful subscription from your provider.
      </p>

      <h2>Try it without Docker first</h2>
      <p>
        Not ready to host? The public instance at{" "}
        <a href="https://iptvwebplayer.org">iptvwebplayer.org</a> runs the same
        codebase. Same player, zero Docker. When you outgrow it, your compose
        file is waiting.
      </p>

      <p>
        If something breaks in your setup, open an issue on{" "}
        <a href="https://github.com/kvnpyy/streamly">GitHub</a> with your
        browser, proxy, and whether you&apos;re on Xtream or M3U — I read them.
      </p>

      <p className="text-sm border-t border-white/10 pt-6 mt-10">
        <strong className="text-(--text)">Disclaimer:</strong> Streamly is a
        media player only. It does not provide channels, playlists, or
        copyrighted content. You are responsible for your provider subscription
        and compliance with local law.
      </p>
    </BlogArticleBody>
  );
}
