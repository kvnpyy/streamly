# Android TV — Trusted Web Activity (TWA)

Ship Streamly on Google Play / Android TV without maintaining a separate native UI. The TWA opens `https://iptvwebplayer.org` fullscreen using Chrome Custom Tabs.

## Prerequisites

- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap): `npm install -g @bubblewrap/cli`
- [Android Studio](https://developer.android.com/studio) (for signing & AAB upload)
- Google Play Console account ($25 one-time)

## Build steps

```bash
cd tv-apps/androidtv
mkdir -p twa-project && cd twa-project

# Initialize from template (first time)
bubblewrap init --manifest=https://iptvwebplayer.org/manifest.webmanifest
# Or copy ../twa-manifest.json and run:
bubblewrap update --manifest=../twa-manifest.json

bubblewrap build
```

Bubblewrap generates an Android project. Enable **Android TV** in `AndroidManifest.xml` (leanback launcher) if not added automatically:

```xml
<uses-feature android:name="android.software.leanback" android:required="false" />
<category android:name="android.intent.category.LEANBACK_LAUNCHER" />
```

## Digital Asset Links

After you generate a signing key, set env vars on the server and redeploy:

```bash
ANDROID_TWA_PACKAGE_NAME=org.streamly.iptv
ANDROID_TWA_SHA256_FINGERPRINTS=AA:BB:CC:...   # from keytool -list -v
```

The site serves `https://iptvwebplayer.org/.well-known/assetlinks.json` automatically when configured (`src/app/.well-known/assetlinks.json/route.ts`).

Or host the static template manually: copy `assetlinks.json` to your CDN.

```bash
keytool -list -v -keystore android-signing-key.keystore -alias streamly
```

Without asset links, the TWA opens in a browser tab instead of standalone.

## Icons

Run `npm run tv:store:icons` — uses `icon-512.png` in this folder.

## Store listing

Copy from `../store-listings/android-tv.md`.

## Fire TV fallback

If you prefer a single Android binary for both Fire and Google, target Amazon Appstore with the same AAB (WebView wrapper). Hosted web app on Fire is simpler — see `../firetv/README.md`.
