# Roku (deferred)

Roku Channel Store requires a **Roku SceneGraph** (BrightScript) or Direct Publisher channel — not a hosted web wrapper. Streamly’s web app does not run inside Roku’s browser the way it does on Samsung/LG/Fire.

## Options when you are ready

1. **Direct Publisher** — Only if you have a stable MRSS/JSON feed of your own licensed content. Not suitable for generic Xtream/M3U IPTV.
2. **SceneGraph app** — Native shell with a video player component; would need a separate playback stack (HLS via `roVideoPlayer`), not the full Next.js UI.
3. **Partner catalog** — Some IPTV providers ship Roku apps; Streamly would be a parallel product.

## Recommendation

Prioritize **Samsung**, **LG**, **Fire TV**, and **Android TV** (this repo’s `tv-apps/` wrappers). Revisit Roku when you have traction and budget for a dedicated BrightScript client.

## Reference

- [Roku Developer](https://developer.roku.com/)
- [Channel publishing guide](https://developer.roku.com/docs/developer-program/publishing/channel-publishing-guide.md)
