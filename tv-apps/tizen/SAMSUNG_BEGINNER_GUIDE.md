# Samsung Smart TV — beginner step-by-step

You already created a Samsung seller account. **Important:** the screen in your screenshot is the **Galaxy Store** (phones / watches). Streamly needs the **TV Seller Office** — a different part of the same Samsung ecosystem.

---

## Part A — Use the correct portal

1. Open **Google Chrome** or **Microsoft Edge** (Samsung TV portal does not work well in Safari).
2. Go to: **https://seller.samsungapps.com/tv/**
3. Sign in with the **same Samsung account** you used for seller registration.
4. You should see **“TV Seller Office”** (not “Galaxy Store Seller Portal”).
5. If you only see Android / Galaxy Watch when clicking Add App, you are on the **wrong** URL — use `/tv/` at the end.

---

## Part B — Install Tizen Studio (Mac)

You need this to **sign** the app package before upload.

1. Go to https://developer.tizen.org/development/tizen-studio/download
2. Download **Tizen Studio** for macOS and run the installer.
3. Open **Package Manager** (installed with Tizen Studio).
4. Install these extensions:
   - **Tizen SDK tools**
   - **TV Extensions** (Samsung TV)
   - **Samsung Certificate Extension** (if offered)
5. Wait for downloads to finish (can take 20–40 minutes).

---

## Part C — Create a signing certificate (one-time)

1. Open **Tizen Studio** → menu **Tools** → **Certificate Manager** (or launch Certificate Manager app).
2. Click **+** to create a new profile.
3. Choose **Samsung** → **TV** → **Create a new certificate**.
4. Fill in:
   - **Author name:** your name or company
   - **Password:** pick something you will remember — you need it every time you sign
   - **Country, city, etc.:** your real info
5. Finish the wizard. Note the **profile name** (e.g. `streamly-tv`).

Samsung may ask you to log in with your Samsung account to authorize the certificate.

---

## Part D — Build the Streamly package on your Mac

In Terminal, from the Streamly project folder:

```bash
cd "/Users/kevinpayoyo/Projects/IPTV PROJECT/iptv-player"
npm run tv:store:package
```

This creates:

`tv-apps/dist/streamly-samsung-tizen-1.0.0-unsigned.wgt`

---

## Part E — Sign the `.wgt` file

### Option 1 — Command line (after Tizen CLI is installed)

```bash
cd tv-apps/tizen
tizen package -t wgt -s streamly-tv .
```

Replace `streamly-tv` with your Certificate Manager profile name.

Output: a **signed** `.wgt` in the `tizen` folder.

### Option 2 — Tizen Studio GUI

1. **File** → **Import** → **Tizen** → **Tizen Web Project**
2. Select folder: `iptv-player/tv-apps/tizen`
3. Right-click project → **Build Signed Package**
4. Choose your certificate profile and password.

Keep the signed `.wgt` file — you upload this to Samsung.

---

## Part F — Test on your Samsung TV (strongly recommended)

1. On the TV remote: open **Apps** screen.
2. Press **1 2 3 4 5** quickly on the remote (or **1 2 3 4 5** per Samsung docs for your year).
3. Turn **Developer mode** **ON**.
4. Enter your PC’s IP address when asked.
5. On Mac Terminal:

```bash
sdb connect YOUR_TV_IP
tizen install -n streamly-samsung-tizen-1.0.0-unsigned.wgt -t YOUR_TV_NAME
```

(Use the **signed** `.wgt` filename if different.)

6. Open **Streamly** in the TV app list. You should see the login / PIN screen.

If it loads and you can navigate with the remote, you are ready to submit.

---

## Part G — Register the app in TV Seller Office

1. Go to https://seller.samsungapps.com/tv/
2. **Applications** → **Add Application** (wording may vary).
3. Create a new app:
   - **Name:** `Streamly`
   - **Type:** Web application / Tizen (TV)
   - **Default language:** English
4. Samsung assigns an **Application ID** — save it.

---

## Part H — Upload the signed package

1. **Applications** → your app → **App Package**
2. **Upload** your signed `.wgt`
3. Wait for Samsung’s **pre-test**. Fix any errors they report (common: missing icon, wrong profile, certificate expired).

---

## Part I — Store listing (copy-paste)

Open `tv-apps/store-listings/samsung.md` in the project and copy each field.

| Field | Value |
|-------|--------|
| Title | Streamly |
| Description | (from samsung.md) |
| Privacy URL | https://iptvwebplayer.org/legal/privacy |
| Support URL | https://iptvwebplayer.org/tv |
| Support email | support@iptvwebplayer.org |
| Category | Videos / Entertainment |
| Icon | `tv-apps/tizen/icon.png` (512×512) |

**Screenshots:** 3–5 images at **1920×1080** — see `tv-apps/assets/screenshots/README.md`.

---

## Part J — Content rating & legal

When Samsung asks about content:

- Streamly is a **media player only**.
- Users connect **their own** IPTV subscription (Xtream / M3U).
- You **do not** sell or host channels.
- Mature content may appear depending on the user’s provider — disclose honestly.

---

## Part K — Submit for review

1. **Applications** → **Distribute**
2. Select **TV model groups** (usually all supported regions / models).
3. Click **Request release** / **Submit for review**.
4. Review often takes **several business days**.

You will get email updates on approval or requested changes.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Portal only shows Android / Watch | Use https://seller.samsungapps.com/tv/ in Chrome |
| “Browser not supported” | Switch to Chrome or Edge |
| Pre-test fails on package | Re-sign with TV certificate profile, not mobile |
| App blank on TV | Confirm TV has internet; URL is https://iptvwebplayer.org/login |
| PIN pairing fails | Production server must share one SQLite `DATABASE_URL` |

---

## Need help?

Reply in chat with:

- Screenshot of TV Seller Office screen you are on
- Any pre-test error message from Samsung
- Whether Tizen Studio install finished

We can walk through certificate creation or listing fields together.
