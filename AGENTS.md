<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Streamly Knowledge & Agent Guidelines (Antigravity IDE)

For a complete technical breakdown of Streamly's architecture, streaming pipeline, and fixes, read [`docs/ARCHITECTURE_AND_FIXES.md`](file:///home/may/agy/docs/ARCHITECTURE_AND_FIXES.md).

## Critical Rules for Antigravity / Gemini Agents

1. **Git Commands**:
   - Never execute any `git` commands unless explicitly requested by the user.

2. **Video Streaming & Stream Proxy (`src/app/api/stream/route.ts`)**:
   - **User-Agent Rotation**: Live TV streams use `IPTV_UA_HLS` (`IPTVSmartersPlayer`). VOD streams use `IPTV_UA_VOD` (`VLC/...`) with fallback to `IPTV_UA_HLS` if the upstream returns 403/469/500/502.
   - **Range Headers**: Always preserve and forward HTTP `Range` headers on VOD requests and return 206 Partial Content with `Content-Range` and `Accept-Ranges: bytes` for browser seekability.
   - **Origin Headers**: Do NOT attach spoofed `Origin` headers on GET/HEAD requests to media streams or CDNs, as CDNs will deny access (403 Forbidden).
   - **HEAD Request Fallback**: When probing stream URLs, fall back to `GET` with `Range: bytes=0-0` if the server returns 405, 403, or 469.

3. **Xtream Codes API & Catalog Resilience (`src/app/api/xtream/route.ts`, `src/lib/xtream-server-*.ts`)**:
   - Always sanitize server URLs with `normalizeServer(url)` from `src/lib/utils.ts` to strip trailing slashes, duplicate `/player_api.php` paths, and map loopback ports inside Docker containers.
   - Catch upstream status `469` or non-200 responses on category endpoints (`get_series_categories`, `get_vod_categories`) and synthesize category lists directly from stream items.
   - Maintain a generous timeout (35+ seconds) for upstream panel responses to accommodate large catalogs.

4. **Frontend & Rendering Null-Safety**:
   - Use optional chaining (`account?.user_info?...`) on all account / profile data to prevent rendering crashes during guest or review panel sessions.

