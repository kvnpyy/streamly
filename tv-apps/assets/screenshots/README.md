# TV store screenshots

Capture **1920×1080** PNG screenshots on real hardware or dev mode. Stores reject phone-sized or blurry images.

## Samsung Tizen

1. Sideload signed `.wgt` (see `STORE_SUBMISSION.md`).
2. Navigate to each screen.
3. Samsung Developer Mode may offer screenshot tools, or use `sdb shell screencap` / TV screenshot shortcut if available.

## LG webOS

```bash
ares-screenshot --device my-tv screenshot.png
```

## Fire TV

1. Open Silk → `https://iptvwebplayer.org/login`
2. Use Fire TV screenshot (hold Home + menu, or `adb shell screencap` on rooted/dev devices).

## Recommended shots (same 5 for all stores)

| # | Screen | Route |
|---|--------|-------|
| 1 | PIN login / Link with PIN | `/login` |
| 2 | Live TV grid | `/live` (after login) |
| 3 | EPG or channel detail | `/live` + open guide |
| 4 | Movie detail | `/movies` → pick title |
| 5 | TV setup page | `/tv` |

## Tips

- Use a demo playlist with safe, licensed-looking poster art for review.
- Hide personal credentials in screenshots (use PIN screen or blurred fields).
- Dark theme matches store backgrounds — looks professional on Samsung/LG listing pages.

Save files here as `01-login.png`, `02-live.png`, etc., before uploading to each console.
