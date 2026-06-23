# Amazon Fire TV (hosted web app)

Fire TV supports **Web Apps** in the Amazon Appstore without shipping an APK. The store listing points at your HTTPS URL; Silk opens it fullscreen.

**Listing copy:** `../store-listings/amazon-firetv.md`  
**Full checklist:** `../STORE_SUBMISSION.md`

## Configure

1. Production URL: `https://iptvwebplayer.org` (or your self-hosted origin).
2. Start path: `/login` (TV users land on PIN tab automatically).
3. Optional setup guide: `/tv`

## Submit

1. [Amazon Developer Console](https://developer.amazon.com/apps-and-games) → Add App → Web App.
2. Enter the URL and verify ownership (Amazon fetches a verification file or meta tag).
3. Category: Entertainment or Utilities.
4. Age rating: likely 17+ / mature themes depending on IPTV content disclaimer.
5. Screenshots: capture from Fire TV Silk at 1920×1080.

## Alternative: Android WebView APK

If Amazon rejects the hosted web app listing, package a minimal WebView APK:

```kotlin
// WebView loads https://iptvwebplayer.org/login
// Same URL as Silk — reuse Streamly TV shell in the embedded browser.
```

Tools: Android Studio, Amazon Appstore device targeting (Fire OS).

## Silk tips

- Bookmarking the URL improves return visits.
- PIN pairing is strongly recommended on Fire TV remotes.
- Streamly detects Silk via `tv-user-agent.ts` and applies playback tuning.
