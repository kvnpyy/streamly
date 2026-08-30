# Streamly — Architecture, Streaming Pipeline & Codebase Knowledge

This document provides a comprehensive technical overview of the Streamly codebase, its video playback pipeline, upstream Xtream API integration, and key fixes applied for smooth operation in Docker and web browsers.

---

## 1. Overview & Core Architecture

Streamly is a modern IPTV web application built with Next.js (App Router), TypeScript, and Tailwind CSS. It supports Live TV, Movies (VOD), and TV Series from standard Xtream Codes panels or M3U playlists.

### Key Architectural Layers:
1. **Frontend (`src/components/`, `src/app/`)**:
   - Multi-device UI supporting Desktop, Mobile, and TV / Smart TV layouts (Tizen, webOS, Android TV).
   - Video player powered by `hls.js` for Live TV and native HTML5 `<video>` for browser-compatible VOD (MP4/HLS).
   - Resilient client stores (`zustand`, React Query, `localStorage`).
2. **Stream Proxy (`src/app/api/stream/route.ts`)**:
   - Proxies media streams (HLS chunks, live ts streams, progressive MP4 VOD) to bypass CORS and spoof required IPTV User-Agents.
   - Handles byte-range requests (`Range: bytes=...`) essential for seeking in HTML5 `<video>`.
3. **Xtream Upstream API (`src/app/api/xtream/route.ts`, `src/lib/xtream-server-*.ts`)**:
   - Communicates with Xtream Codes `player_api.php` endpoints.
   - Provides caching, category discovery, error mitigation, and fallback category synthesis.
4. **Mock Review Panel (`src/lib/review-panel/`, `src/app/api/review-panel/`)**:
   - Built-in mock Xtream panel (`/api/review-panel/player_api.php`) for app store reviews (Samsung Tizen, LG webOS, Amazon Fire TV) using safe public streams without requiring external IPTV servers.

---

## 2. Media Playback Pipeline

### Live TV Streams (HLS / TS)
- **Format**: Live channels typically stream as `.m3u8` (HLS) or MPEG-TS.
- **Player**: Rendered via `hls.js` attached to `<video>`.
- **User-Agent**: Proxied with `IPTV_UA_HLS` (`IPTVSmartersPlayer/3.1.5` / `Mozilla/5.0 ... SM-G960F ...`).
- **Endpoint**: `/api/stream?u=<upstream_url>&type=hls`.

### Movies & Series (VOD)
- **Format**: Progressive MP4 or HLS. (Browsers natively support H.264/AAC MP4; MKV/HEVC/AC3 require transcoding or client-side demuxing).
- **Player**: Progressive media streams loaded directly into `<video src="/api/stream?u=...&type=vod">`.
- **Range Requests**: Upstream proxy must forward `Range` request headers and return `206 Partial Content` with `Content-Range` and `Accept-Ranges: bytes`.
- **Format Probing (`src/lib/vod-format-probe.ts`)**: Probes whether the server can serve `.mp4` before falling back to `.mkv`.

---

## 3. Critical Fixes & Resilience Measures

### A. Upstream User-Agent Fallback
- **Problem**: Live streams worked because they used `IPTVSmartersPlayer`, but Movies/Series defaulted to `VLC/3.0.20`, which many upstream IPTV CDNs rejected with `403 Forbidden` or `469`.
- **Solution**: [`src/app/api/stream/route.ts`](file:///home/may/agy/src/app/api/stream/route.ts) automatically falls back to `IPTV_UA_HLS` on any `403`, `469`, `500`, or `502` upstream rejection.

### B. Upstream `HEAD` Rejection Workaround
- **Problem**: When the player probed media availability using HTTP `HEAD`, panels returned `405 Method Not Allowed`, `403`, or `469`, falsely signaling the media was unplayable.
- **Solution**: [`src/app/api/stream/route.ts`](file:///home/may/agy/src/app/api/stream/route.ts) falls back from `HEAD` to a lightweight `GET` with header `Range: bytes=0-0`.

### C. CORS & `Origin` Header Handling
- **Problem**: Forwarding spoofed `Origin` headers on `GET`/`HEAD` media requests caused CDNs (e.g., Google Cloud Storage, Cloudflare) to deny access with `403 Access Denied`.
- **Solution**: Removed the `Origin` header from media proxy fetches in [`src/app/api/stream/route.ts`](file:///home/may/agy/src/app/api/stream/route.ts), while preserving `Referer`.

### D. Upstream Status 469 on Series Categories
- **Problem**: Some IPTV servers return status `469` on `get_series_categories` or `get_vod_categories`, throwing uncaught errors and crashing the catalog with 502 Bad Gateway.
- **Solution**:
  - [`src/lib/xtream-server-upstream.ts`](file:///home/may/agy/src/lib/xtream-server-upstream.ts) safely catches non-200 and 469 statuses and returns `[]`.
  - [`src/lib/xtream-server-series-catalog.ts`](file:///home/may/agy/src/lib/xtream-server-series-catalog.ts) and [`src/lib/xtream-server-vod-catalog.ts`](file:///home/may/agy/src/lib/xtream-server-vod-catalog.ts) synthesize category lists directly from stream items if category endpoints fail.

### E. Server URL Normalization & Docker Loopback Mapping
- **Problem**: Server URLs entered with trailing slashes or `/player_api.php` paths produced malformed URLs (e.g. `http://host//player_api.php`). Inside Docker containers (e.g., mapped port `3005:3000`), proxying to `localhost:3005` failed with `ECONNREFUSED`.
- **Solution**:
  - Sanitized all server URLs with [`normalizeServer()`](file:///home/may/agy/src/lib/utils.ts) in [`src/app/api/xtream/route.ts`](file:///home/may/agy/src/app/api/xtream/route.ts) and [`src/lib/xtream-panel-auth.ts`](file:///home/may/agy/src/lib/xtream-panel-auth.ts).
  - Automatically mapped `localhost` / `127.0.0.1` ports to the internal container port (`process.env.PORT || 3000`).
  - Extended panel timeout to 35 seconds to support large catalogs.

### F. Frontend Null-Safety & Error Boundaries
- **Problem**: Missing `user_info` on guest/review sessions caused fatal runtime errors leading to Next.js fallback screens (`▲ Next.js 16.2.6`).
- **Solution**:
  - Added optional chaining (`account?.user_info?...`) across all home, sidebar, and settings components.
  - Added custom error fallbacks in [`src/app/global-error.tsx`](file:///home/may/agy/src/app/global-error.tsx) and [`src/app/error.tsx`](file:///home/may/agy/src/app/error.tsx).

---

## 4. Key Files Reference

| File | Purpose |
| --- | --- |
| [`src/app/api/stream/route.ts`](file:///home/may/agy/src/app/api/stream/route.ts) | Media stream proxy (User-Agent rotation, Range headers, CORS bypass) |
| [`src/app/api/xtream/route.ts`](file:///home/may/agy/src/app/api/xtream/route.ts) | Xtream Codes proxy API route (caching, EPG extraction, URL normalization) |
| [`src/lib/xtream-server-upstream.ts`](file:///home/may/agy/src/lib/xtream-server-upstream.ts) | Upstream Xtream request handler with error tolerance |
| [`src/lib/xtream-server-series-catalog.ts`](file:///home/may/agy/src/lib/xtream-server-series-catalog.ts) | Series catalog loading and category fallback synthesis |
| [`src/lib/xtream-server-vod-catalog.ts`](file:///home/may/agy/src/lib/xtream-server-vod-catalog.ts) | VOD / Movie catalog loading and category fallback synthesis |
| [`src/lib/vod-format-probe.ts`](file:///home/may/agy/src/lib/vod-format-probe.ts) | Container format resolution (MP4 vs MKV) and direct source handling |
| [`src/lib/review-panel/`](file:///home/may/agy/src/lib/review-panel/) | Review panel mock catalog, credentials, and sample streams |
| [`src/lib/utils.ts`](file:///home/may/agy/src/lib/utils.ts) | Shared utilities including `normalizeServer()` and UI helpers |
| [`docker-compose.yml`](file:///home/may/agy/docker-compose.yml) | Docker deployment configuration (port 3005 -> 3000) |
