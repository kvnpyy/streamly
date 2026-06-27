# Samsung Path B — new App ID (required after v1.0.3 cert rejection)

**Old App ID (dead end):** `3202606046491`  
**Status:** Rejected twice with the same CRITICAL install / author-certificate error (v1.0.2 and v1.0.3).

Samsung **locks each App ID to the author certificate from the first App Package upload**. That ID cannot be fixed with a new `.wgt` if the first upload was wrong.

---

## Why Path A failed (what we know)

| Fact | Detail |
|------|--------|
| All signed packages (1.0.0 → 1.0.3) | Same author cert fingerprint (`streamly-tv` / `author.p12`) |
| Packages are valid zips | `author-signature.xml` + `signature1.xml` present |
| Unsigned package existed | `streamly-samsung-tizen-1.0.0-unsigned.wgt` (Jun 22) **before** cert created (Jun 23) |
| Likely root cause | **First App Package upload** on `3202606046491` was unsigned or pre-cert → Samsung registered **no/wrong cert** → every signed resubmit fails |

**Conclusion:** Stop resubmitting on `3202606046491`. Register a **new App ID** and upload a **signed** `.wgt` as the **first** package on that new ID.

---

## What you do (Seller Office)

### 1. Back up certificate (again)

Copy to iCloud/USB/password manager:

```
~/SamsungCertificate/streamly-tv/author.p12
~/SamsungCertificate/streamly-tv/author.pwd   (password file)
```

**Do not create a new author certificate** unless Samsung support tells you to. Reuse `streamly-tv` / `author.p12` for the **new** App ID.

### 2. Create new application

1. https://seller.samsungapps.com/tv/
2. **Applications → + Add Application** (or Register new app)
3. Note the **new App ID** (write it here when done): `________________`

### 3. First upload = signed package only

**Critical:** The **very first** file on the new App ID must be:

```
~/Downloads/UPLOAD-TO-SAMSUNG-NEW-APP-Streamly-v1.0.0.wgt
```

(or rebuild: `npm run tv:store:package` after setting version `1.0.0` in `config.xml`)

**Never upload an unsigned `.wgt` to a new App ID.**

Wait for **App Package pre-test → PASS** before continuing.

### 4. Copy listing from old app

Re-enter (copy/paste from old listing or these docs):

| Section | Source |
|---------|--------|
| Title / description | `tv-apps/store-listings/samsung-tizen.md` |
| Screenshots | `tv-apps/assets/screenshots/samsung/` (9× 1920×1080 JPG) |
| Icons | Seller Office or `tv-apps/assets/samsung-icons/` |
| Service Info / Billing | Same as before (free app) |
| Verification Info | `SAMSUNG_VERIFICATION_FILL_IN.md` — update **App ID** and **version 1.0.0** in PPTX |
| PPTX | Regenerate: `npm run tv:store:app-description` (if script exists) or edit version slide |

### 5. Verification Info — test accounts (unchanged)

```
Server URL:  https://iptvwebplayer.org/api/review-panel
Username:    samsung_review  (or samsung_review_2 … _12 per model group)
Password:    StreamlyReview2026
```

### 6. Distribute → Request New Release

Same US model groups as before.

### 7. Retire old App ID

After the **new** app is **Approved** (or at least submitted successfully):

- Old ID `3202606046491` → stop distributing / withdraw if Seller Office allows  
- Do **not** delete until new app is live (you may need screenshots/copy from it)

---

## Optional — Samsung 1:1 (if you want written confirmation)

**Q&A → 1:1 Inquiry** (paste and replace NEW_APP_ID after you create it):

```
Subject: Author certificate mismatch — new App ID registration

Old App ID: 3202606046491 (Streamly - IPTV Player)
Rejected twice: CRITICAL install error / package corrupted / author certificate

We verified all signed .wgt files (v1.0.0–v1.0.3) use the same author.p12
(profile: streamly-tv). Packages pass local zip/signature checks.

We believe the first App Package on 3202606046491 may have been unsigned
before our Tizen author certificate existed.

We are registering a NEW App ID and will upload a signed .wgt as the first
package. Please confirm we should retire 3202606046491.

New App ID: [YOUR_NEW_ID]
Support: support@iptvwebplayer.org
```

---

## Rebuild signed package (terminal)

```bash
cd "/Users/kevinpayoyo/Projects/IPTV PROJECT/iptv-player"

# For a brand-new App ID, start at 1.0.0 (edit config.xml version first)
npm run tv:store:package

# Verify — must list ONLY runtime files, NO .md:
unzip -l tv-apps/dist/streamly-samsung-tizen-1.0.0-signed.wgt
```

---

## Checklist

- [ ] Backed up `author.p12` + password  
- [ ] Created **new** App ID in TV Seller Office  
- [ ] First upload = **signed** `.wgt` only  
- [ ] Pre-test **PASS**  
- [ ] PPTX / Verification Info updated with **new App ID** + version **1.0.0**  
- [ ] Request New Release submitted  
- [ ] Old App ID `3202606046491` withdrawn after new app is approved  
