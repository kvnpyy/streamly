# Samsung Seller Office — full walkthrough (top to bottom)

Use this while clicking through the **left sidebar** for **Streamly** (App ID `3202606046491`).

Official reference: [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)

---

## Progress tracker

| Step | Sidebar item | Status |
|------|----------------|--------|
| 1 | App Package | ✅ Done (you uploaded the signed `.wgt`) |
| 2 | **App Images** | 👉 **You are here** |
| 3 | Service Info | Next |
| 4 | Title/Description on TV | Next |
| 5 | Service Country/Region | Next |
| 6 | Billing Info | Next |
| 7 | App Feature Info | Next |
| 8 | Verification Info | Next |
| 9 | Distribute | Last — submit for review |

**After each page: click Save** (bottom of the form).

---

## 2. App Images ← current step

### Screenshots (you already uploaded)

| # | Upload this file |
|---|------------------|
| 1 | `tv-apps/assets/screenshots/samsung/01-login.jpg` |
| 2 | `tv-apps/assets/screenshots/samsung/02-live-tv.jpg` |
| 3 | `tv-apps/assets/screenshots/samsung/03-movie-detail.jpg` |
| 4 | `tv-apps/assets/screenshots/samsung/04-tv-home.jpg` |
| 5 (optional) | `tv-apps/assets/screenshots/samsung/05-movies-grid.jpg` |

Requirements: **JPG**, **1920×1080**, **≤500 KB each**, **minimum 4**.

### Icon images (upload these now)

Generate if needed:

```bash
npm run tv:store:icons          # pulls 512×512 app icon from production
npm run tv:store:samsung-icons  # builds Samsung Seller Office icon set
```

Upload from **`tv-apps/assets/samsung-icons/`**:

| Seller Office field | File to upload |
|---------------------|----------------|
| **Logo asset with transparency** | `samsung-logo-1920x1080.png` |
| **Background image** | `samsung-background-1920x1080.jpg` |
| **512×423 full color asset** | `samsung-icon-512x423.png` |

After logo + background upload, Samsung auto-creates **16:9** and **1:1** icons. You can leave the auto 1:1 as-is unless you want to replace it.

**Tip:** Logo is only the Streamly mark (transparent). Background is the purple/teal gradient. Samsung layers them on the TV home screen.

Click **Save**.

---

## 3. Service Info

| Field | What to enter |
|-------|----------------|
| **Service category** | **Videos** |
| **Rating (age)** | **18+** or **Adults** if offered — IPTV content depends on the user’s provider and may include mature channels. If Samsung only offers lower tiers, pick the highest honest rating (often **15+** / **Teen** with explanation in review notes). When unsure, choose **18+** and explain in verification that you don’t host content. |
| **Language** | **English** (add others later if you localize) |
| **Privacy policy URL** | `https://iptvwebplayer.org/legal/privacy` |
| **Seller information** | Your business name, **support@iptvwebplayer.org**, site URL `https://iptvwebplayer.org`, address/phone as required |
| **DoC for EAA** | Skip unless you sell in EU and have an accessibility conformity document |

**Category note:** Samsung may scrutinize **Videos** for IPTV players. Streamly is a **media player shell** — users bring their own legal subscription. Say that clearly in the description.

Click **Save**.

---

## 4. Title/Description on TV

### Critical rule

Your **default language app title** must match `config.xml` exactly:

```xml
<name>Streamly</name>
```

So the **App Title** in default language = **`Streamly`** (not “Streamly — IPTV Player”). A longer subtitle can go in the **Description**.

### Default language: English

| Field | Copy-paste |
|-------|------------|
| **App Title** | `Streamly` |
| **Description** | See block below |
| **Tags** (≥3, comma-separated) | `IPTV, live TV, media player` |

**Description** (under 4000 chars):

```
Streamly is a modern IPTV player for your own subscription. Sign in with Xtream Codes or an M3U playlist from your provider.

• Live TV with channel guide and EPG
• Movies and series with posters and resume playback
• PIN pairing — link your TV from your phone without typing passwords
• Remote-friendly layout optimized for Samsung Smart TV

You need an active IPTV subscription from your provider. Streamly is the player only; we do not provide or sell any channels or content.

Setup help: https://iptvwebplayer.org/tv
```

Click **Save**.

---

## 5. Service Country/Region

| Field | Recommendation |
|-------|----------------|
| **Countries** | Select every country where you want the app listed (e.g. **United States**, **Canada**, **United Kingdom**, etc.). Start with your main markets; you can expand later. |
| **Rating certification** | Only if a country requires an uploaded certificate (e.g. Brazil MJ/DEJUS) — skip if not prompted |

**EU / DSA:** If you include EU countries, you may need a business registration number in Service Info.

Click **Save**.

---

## 6. Billing Info

| Option | Select |
|--------|--------|
| **Free** | ✅ **Yes** — Streamly does not sell subscriptions or use Samsung Checkout |

Do **not** enable Samsung Checkout or 3rd party billing unless you add in-app purchases later.

Click **Save**.

---

## 7. App Feature Info

If nothing applies, you can choose **Not applicable**. For Streamly, these are the honest answers:

| Feature | Select? | Notes |
|---------|---------|-------|
| **Player** | ✅ **Yes** | Open **Player** sub-form |
| Caption | No | Unless you add US closed-caption IP streams |
| External devices | No | |
| In-app AD | No | |
| Smart View | No | |
| Gamepad / Magic remote extras | No | D-pad works in web UI |

### Player sub-form (when Player = Yes)

| Field | Select |
|-------|--------|
| **Video codec** | **H.264** (+ **HEVC** if your streams use it) |
| **Audio codec** | **AAC**, **MP3** |
| **Container** | **MPEG-TS**, **MP4**, **MKV** (provider-dependent) |
| **DRM** | **AES-128** if HLS keys are used; otherwise note “provider-dependent” in Other |
| **Streaming engine** | **HLS** |
| **Player API** | **MSE** (browser Media Source Extensions via hls.js) |
| **Subtitle** | **WebVTT** if subtitles appear in player |
| **Other** | `Web-based player loading user IPTV streams over HTTPS. Codecs depend on the user provider.` |

Click **Save**.

---

## 8. Verification Info

Samsung’s testers need to **use the app without guessing**.

| Field | What to provide |
|-------|-----------------|
| **App description file** | Upload a short UI walkthrough (PPTX/PDF). Easiest: 4–6 slides with your **store screenshots** + bullet steps: (1) Open app → PIN login, (2) Pair from phone Settings → Link TV, (3) Browse Live TV / Movies. See `tv-apps/assets/samsung-icons/VERIFICATION_UI_OUTLINE.md`. |
| **Geo IP block** | **No** (unless you block countries on your server) |
| **Test accounts** | Streamly uses **bring-your-own IPTV**. Provide **PIN pairing instructions** instead of fake Xtream passwords |

### Test account text (paste in Verification)

```
Streamly does not provide IPTV channels. Reviewers use their own Xtream/M3U credentials OR test PIN pairing:

1. On a phone/PC, open https://iptvwebplayer.org/login and sign in with any valid Xtream or M3U URL.
2. Go to Settings → Link a TV with a PIN → generate a 6-digit code.
3. On the TV app, open Streamly → Link with PIN → enter the code.

Test URL loaded by the TV wrapper: https://iptvwebplayer.org/login

If Samsung requires a dedicated test playlist, contact support@iptvwebplayer.org before review.
```

| **Voucher code** | Leave empty (no paid content in app) |

Click **Save**.

---

## 9. Distribute

1. Open **Distribute** in the sidebar.
2. Select **TV model groups** (usually all supported 2016+ models).
3. Fix any red ❌ items in the sidebar first.
4. Click **Request release** / **Submit for review**.

Review often takes **several business days** (sometimes weeks). Watch email for pre-test failures.

---

## Quick reference URLs

| Purpose | URL |
|---------|-----|
| Privacy | https://iptvwebplayer.org/legal/privacy |
| Terms | https://iptvwebplayer.org/legal/terms |
| TV setup / support | https://iptvwebplayer.org/tv |
| App entry (in `.wgt`) | https://iptvwebplayer.org/login |
| Support email | support@iptvwebplayer.org |

---

## Common pre-test failures

| Error | Fix |
|-------|-----|
| App title ≠ package name | Title must be **`Streamly`** (matches `config.xml`) |
| Icon wrong size/format | Re-run `npm run tv:store:samsung-icons` |
| Screenshot not JPG / too large | Use `tv-apps/assets/screenshots/samsung/*.jpg` |
| Preview / resume fails | Ensure production has `/tv/preview.json` and `eden_resume` handler (already in your `.wgt`) |

---

## Files cheat sheet

```
tv-apps/dist/streamly-samsung-tizen-1.0.2-signed.wgt   ← App Package
tv-apps/assets/screenshots/samsung/*.jpg             ← Screenshots
tv-apps/assets/samsung-icons/                        ← Icon uploads
tv-apps/store-listings/samsung.md                      ← Marketing copy
```
