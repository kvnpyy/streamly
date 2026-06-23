# Streamly — Smart TV store submission checklist

Everything in this repo that can be automated is done. **You** must create developer accounts, sign packages, and click Submit in each store console. Use the copy-paste text in `store-listings/` and the unsigned packages from `npm run tv:store:package`.

## Quick commands

```bash
npm run tv:store:icons    # Pull icons from production PWA
npm run tv:store:package  # Build unsigned .wgt + .ipk in tv-apps/dist/
```

## Accounts to create (one-time)

| Platform | Portal | Fee |
|----------|--------|-----|
| Samsung TV | [TV Seller Office](https://seller.samsungapps.com/tv/) (Chrome/Edge — not Galaxy Store mobile) | Free |
| LG webOS | [Seller Lounge](https://seller.lgappstv.com/) | Free |
| Amazon Fire TV | [Developer Console](https://developer.amazon.com/apps-and-games) | Free |
| Google Play (Android TV) | [Play Console](https://play.google.com/console) | $25 one-time |
| Vizio / Hisense / etc. | Varies | Often free hosted-web listings |

**Not covered here (separate native stacks):** Roku (BrightScript), Apple TV (tvOS/Swift). See `roku/README.md` and defer until you want dedicated native apps.

---

## 1. Samsung Tizen (`.wgt`)

### Repo assets

- Wrapper: `tv-apps/tizen/`
- Config: `config.xml`, `index.html`, `icon.png`
- Package: `tv-apps/dist/streamly-samsung-tizen-1.0.0-unsigned.wgt` (after build)

### Your steps

1. Install Tizen SDK — see [tv-apps/tizen/DOWNLOAD_LINKS.md](tizen/DOWNLOAD_LINKS.md) or run `npm run tv:store:tizen-setup -- --open` (CLI ~326 MB). Do **not** use the samsungtizenos.com VS Code/.NET docs page — it has no installer. Official TV guide: [Installing TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html).
2. Register at [TV Seller Office](https://seller.samsungapps.com/tv/) — use Chrome or Edge, not the Galaxy Store (mobile) portal.
3. Create a **certificate profile** in Tizen Studio (Certificate Manager).
4. Open `tv-apps/tizen` as a Tizen Web project, or sign the unsigned `.wgt`:
   ```bash
   cd tv-apps/tizen
   tizen package -t wgt -s <your-certificate-profile> .
   ```
5. Enable **Developer Mode** on your Samsung TV (Apps → 12345 on remote) and sideload to test:
   ```bash
   sdb connect <TV-IP>
   tizen install -n streamly-samsung-tizen-1.0.0-unsigned.wgt -t <TV-NAME>
   ```
6. In Seller Office → **New App** → upload signed `.wgt`.
7. Paste listing text from `store-listings/samsung.md`.
8. Upload **3+ screenshots** at 1920×1080 (see `assets/screenshots/README.md`).
9. Privacy URL: `https://iptvwebplayer.org/legal/privacy`
10. Content rating: position as **media player** — users supply their own IPTV subscription; you do not sell channels.

**Review tips:** D-pad navigation must work (back key, focus rings). PIN pairing at `/login` avoids password typing.

---

## 2. LG webOS (`.ipk`)

### Repo assets

- Wrapper: `tv-apps/webos/`
- Config: `appinfo.json`, `index.html`, icons
- Package: `tv-apps/dist/streamly-lg-webos-1.0.0-unsigned.ipk`

### Your steps

1. Install [webOS TV SDK](https://webostv.developer.lge.com/develop/sdk/installing-the-sdk).
2. Register at [LG Seller Lounge](https://seller.lgappstv.com/).
3. Add your TV as a device (`ares-setup-device`).
4. Sign and package:
   ```bash
   cd tv-apps/webos
   ares-package -n . -o ../dist
   # or sign first with your developer certificate
   ```
5. Test install:
   ```bash
   ares-install --device my-tv ../dist/org.streamly.iptv_1.0.0_all.ipk
   ares-launch --device my-tv org.streamly.iptv
   ```
6. Submit `.ipk` + listing from `store-listings/lg.md`.

---

## 3. Amazon Fire TV (hosted web app)

No package to upload — Amazon lists your **HTTPS URL**.

### Repo assets

- Guide: `tv-apps/firetv/README.md`
- Icons: `tv-apps/firetv/icon-512.png`, `icon-114.png`
- Listing: `store-listings/amazon-firetv.md`

### Your steps

1. [Amazon Developer Console](https://developer.amazon.com/apps-and-games) → **Add App** → **Web App**.
2. **Web App URL:** `https://iptvwebplayer.org/login`
3. Complete **domain verification** (Amazon gives a meta tag or file — add to your site if requested; contact us to add verification route if needed).
4. Category: **Entertainment** or **Utilities**.
5. Upload icons and 1920×1080 screenshots from Fire TV Silk.
6. Age rating: complete questionnaire; note IPTV content comes from user's provider.
7. Privacy policy URL required.

**Silk:** Streamly auto-detects Fire TV and enables TV shell + playback tuning.

---

## 4. Google Play — Android TV (optional)

Wrap the existing PWA as a **Trusted Web Activity** (TWA) so it appears on Android TV / Google TV launchers.

### Repo assets

- Template: `tv-apps/androidtv/twa-manifest.json`
- Guide: `tv-apps/androidtv/README.md`
- Icons: `tv-apps/androidtv/icon-512.png`

### Your steps

1. Install [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap): `npm i -g @bubblewrap/cli`
2. Copy `twa-manifest.json` and run `bubblewrap init --manifest=...` (or `bubblewrap update`).
3. Add **Digital Asset Links** (`/.well-known/assetlinks.json`) on `iptvwebplayer.org` — template in `androidtv/assetlinks.json`.
4. Build AAB, enable **Android TV** form factor in Play Console.
5. Listing: `store-listings/android-tv.md`.

---

## 5. Marketing assets (all stores)

| Asset | Size | Location |
|-------|------|----------|
| App icon | 512×512 PNG | `tv-apps/*/icon*.png` |
| TV screenshots | 1920×1080 PNG × 3–5 | Capture on real TV — see `assets/screenshots/README.md` |
| Feature graphic (Play) | 1024×500 | Create in Figma/Canva |
| Short description | ≤ 80 chars | `store-listings/*.md` |
| Full description | ≤ 4000 chars | `store-listings/*.md` |

Suggested screenshots:

1. Login / PIN pairing screen
2. Live TV grid with EPG
3. Movie detail page
4. Series / continue watching
5. `/tv` setup guide (optional)

---

## 6. Legal & support URLs

Use these in every store listing (or your self-hosted equivalents):

| Field | URL |
|-------|-----|
| Privacy | https://iptvwebplayer.org/legal/privacy |
| Terms | https://iptvwebplayer.org/legal/terms |
| Support / TV setup | https://iptvwebplayer.org/tv |
| App URL | https://iptvwebplayer.org/login |

Support email: `support@iptvwebplayer.org` (set `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` in production).

---

## 7. What we cannot do from code

- Create your Samsung / LG / Amazon / Google developer accounts
- Pay Play Console registration fee
- Sign packages with **your** certificates (private keys stay on your machine)
- Pass store review on your behalf
- Guarantee approval for IPTV players (be clear: **BYO subscription**, no pirated content)

---

## 8. After approval

1. Update `tv-apps/store-config.json` version when you ship wrapper changes.
2. Re-run `npm run tv:store:package` and submit store updates.
3. Point users to **https://iptvwebplayer.org/tv** for install help and PIN pairing.
4. Ensure VPS `DATABASE_URL` is shared across instances so PIN pairing works at scale.
