# Samsung rejection fix — package / certificate (CRITICAL)

**Rejection:** Install error / package corrupted / author certificate must match registration.

**App ID:** `3202606046491`  
**This is NOT a UI-description failure** — your Verification Info can stay; fix the **`.wgt` signing**.

---

## What went wrong (diagnosis)

I checked your machine and packages:

| Finding | Detail |
|---------|--------|
| Your signed `1.0.2` `.wgt` | Zip OK, has `author-signature.xml` + `signature1.xml` |
| Author cert | Same across 1.0.0 / 1.0.1 / 1.0.2 (`~/SamsungCertificate/streamly-tv/author.p12`) |
| Distributor cert | `tizen-distributor-signer` (default public — normal for Seller Office; store re-signs) |
| **Risk** | Packaging from `tv-apps/tizen/` **included all `.md` guide files** in a rebuild — bloats/corrupts the widget package |
| **Risk** | If you ever **recreated** the author certificate after the first App Package upload, Samsung locks to the **first** author cert → install fails |

Samsung’s message means: **the `.wgt` they install must be signed with the same `author.p12` that was used when the app was first registered in App Package.**

---

## Fix path A — same App ID (FAILED — v1.0.2 and v1.0.3 rejected)

**Do not resubmit on App ID `3202606046491`.** Use **Path B** below.

Path A was attempted with clean signed packages; Samsung rejected again with the same
certificate error. Likely cause: first App Package on this ID was unsigned (before
author cert existed Jun 23). Samsung cannot change the registered cert on an existing ID.

---

### Step 1 — Back up your certificate (do this now)

Copy to iCloud/USB:

```
~/SamsungCertificate/streamly-tv/author.p12
~/SamsungCertificate/streamly-tv/author.pwd   (if it has your password)
```

Write the password in your password manager. **If you lose `author.p12`, you cannot update this App ID.**

### Step 2 — Do NOT create a new certificate

In **Certificate Manager**, profile `streamly-tv` must keep using:

```
~/SamsungCertificate/streamly-tv/author.p12
```

If you already clicked “create new author certificate” after your first Seller Office upload, Path A may fail → use Path B below.

### Step 3 — Build a clean signed package (v1.0.3)

From the project:

```bash
cd "/Users/kevinpayoyo/Projects/IPTV PROJECT/iptv-player"
npm run tv:store:package
```

Output (clean — **only** `config.xml`, `index.html`, `icon.png`, `shared/`, signatures):

```
tv-apps/dist/streamly-samsung-tizen-1.0.3-signed.wgt
```

Verify inside the zip — **must NOT** contain `.md` files:

```bash
unzip -l tv-apps/dist/streamly-samsung-tizen-1.0.3-signed.wgt
```

### Step 4 — Optional: sideload on your TV

```bash
sdb connect YOUR_TV_IP
tizen install -n tv-apps/dist/streamly-samsung-tizen-1.0.3-signed.wgt -t YOUR_TV_NAME
```

If it installs and opens on your TV, signing is OK.

### Step 5 — Seller Office

1. **App Package** → upload `streamly-samsung-tizen-1.0.3-signed.wgt`  
2. Wait for **pre-test** to pass  
3. **Distribute** → **Request New Release** (same model groups as before)  
4. Verification Info / PPTX — **no change required** unless Samsung asks

### Step 6 — DSA banner (if still showing)

**Membership** → set Individual vs Business  
If business → **Service Info** → registration number

---

## Fix path B — new App ID (**do this now**)

See **`SAMSUNG_PATH_B_NEW_APP.md`** for the full checklist.

Use this if Samsung rejects again with the **same certificate error** after a clean 1.0.3 upload.

Samsung does **not** let you change the registered author certificate on an existing App ID.

1. **Back up** new `author.p12` immediately  
2. Seller Office → **Add Application** → new App ID  
3. Upload clean signed `.wgt`  
4. Re-enter listing, screenshots, Verification Info (copy from `SAMSUNG_VERIFICATION_FILL_IN.md`)  
5. **Withdraw / stop** old App ID `3202606046491` after the new one is approved  

---

## Test accounts (unchanged)

Still use 10 parallel usernames for your 10+ model groups — see `SAMSUNG_VERIFICATION_FILL_IN.md`.

Production QA login is live at `https://iptvwebplayer.org/api/review-panel`.

---

## 1:1 Q&A message (if Path A fails)

```
App ID: 3202606046491
Rejection: CRITICAL Install error / package corrupted / author certificate

We rebuilt v1.0.3 with a clean .wgt (runtime files only, valid 
author-signature.xml and signature1.xml). Author certificate path: 
~/SamsungCertificate/streamly-tv/author.p12 (unchanged since first upload).

Please confirm the author certificate fingerprint registered for this 
App ID matches our submission, or advise if we must register a new App ID.
```

---

## Quick checklist

- [ ] Backed up `author.p12` + password  
- [ ] Did **not** create new author certificate  
- [ ] Built `streamly-samsung-tizen-1.0.3-signed.wgt` via `npm run tv:store:package`  
- [ ] Zip contains **no** `.md` files  
- [ ] Pre-test passes on App Package upload  
- [ ] Request New Release submitted  
- [ ] 10 test accounts in Verification Info  
