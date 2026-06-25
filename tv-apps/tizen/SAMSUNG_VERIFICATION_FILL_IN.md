# Verification Info — copy-paste guide (Streamly)

You are on **Applications → Verification Info**. Fill each section below, then **Save**.

---

## 1. App description file (required)

Samsung requires their **official PowerPoint template** — do not use a blank deck.

1. On the Verification Info page, click **download template file** (or get it from [Application UI Description](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/application-ui-description.html)).
2. **Or use the pre-filled file:** `tv-apps/assets/samsung-icons/Streamly-App-UI-Description-v1.0.2.pptx` (also copied to your Downloads folder).
3. Regenerate anytime: `npm run tv:store:app-description`

### Title slide

| Field | Value |
|-------|--------|
| Application name | Streamly |
| Content provider | Streamly / iptvwebplayer.org |
| App version | 1.0.2 (match your signed `.wgt`) |

### UI structure (simple flow)

```
Launch → Login (PIN / Xtream / M3U)
  → Home
    → Live TV → Play channel
    → Movies → Movie detail → Play
    → Series → Series detail → Play episode
    → Search
    → Settings
  → Player overlay (Back to exit)
```

### Use cases (minimum — write as numbered steps)

**UC1 — Sign in with PIN (recommended on TV)**  
1. Open app → **Link with PIN** tab (default on TV).  
2. On phone/PC: https://iptvwebplayer.org/login → sign in → **Settings → Link a TV with a PIN** → generate 6-digit code.  
3. On TV: enter code → **Continue** → Home loads.

**UC2 — Sign in with Xtream**  
1. Login → **Xtream** tab.  
2. Enter server URL, username, password → Sign in.

**UC3 — Browse Live TV**  
1. Home or nav → **Live TV**.  
2. Select category → select channel → video plays.

**UC4 — Browse Movies**  
1. Nav → **Movies** → select title → **Play**.

**UC5 — Exit player**  
1. Press **Return** on remote → leaves player / previous screen.

### Login test info (inside UC1 — required by Samsung)

Paste this in the User Login section of the template:

```
Streamly includes built-in QA Xtream accounts (sample public test streams only).

Server URL (all accounts):  https://iptvwebplayer.org/api/review-panel
Password (all accounts):    StreamlyReview2026

Parallel model-group testing — use a DIFFERENT username per TV:
  Account 1: samsung_review      (or samsung_review_1)
  Account 2: samsung_review_2
  Account 3: samsung_review_3
  … up to samsung_review_12 (same password, identical playlist)

All accounts expose the same content: Live TV, Movies, Series, Search.
No ads, no premium tier, no account-specific UI differences.

PIN alternative: sign in on PC with any account above → Settings → Link a TV 
with a PIN → enter code on TV.

App ID: 3202606046491 | Support: support@iptvwebplayer.org
```

### Menus and functions

Insert these screenshots with numbered callouts:

| Screen | Screenshot file |
|--------|-----------------|
| PIN login | `01-login.jpg` |
| Live TV | `02-live-tv.jpg` |
| Movie detail | `03-movie-detail.jpg` |
| Home | `04-tv-home.jpg` |

### Remote control keys

| Key | Action |
|-----|--------|
| Up / Down / Left / Right | Move focus between buttons, channels, posters |
| OK / Enter | Select focused item; play channel or movie |
| Return | Back one screen; exit player overlay |
| Exit | Close app (Tizen default) |
| Play / Pause | Toggle playback when player focused |

Volume keys: **not overridden** (TV system volume).

### Language options

```
English only. UI follows TV system language where supported; no in-app 
language picker. All store listing text is English.
```

5. Save as `.pptx` and click **Attach File** on Verification Info.

---

## 2. Geo IP block

Select: **Unuse**

(Streamly does not block countries by IP. Required for Samsung testers worldwide and for future Canada expansion.)

---

## 3. Test accounts (Samsung parallel model-group rule)

Samsung’s form says:

> Provide **enough test accounts equal to or greater than the number of model groups** that will release the application. Testing runs **simultaneously** across all model groups.

Samsung’s multi-account **example** (ads vs 4K vs Live TV) applies when **content differs by account**. **Streamly does not** — every QA account has the **same** sample playlist (Live TV + Movies + Series). You still need **one row per model group**, each with a **different username** so testers do not collide.

### Before you fill the form

1. Open **Distribute** (or your saved distribution settings) and **count how many TV model groups** you selected.
2. Add **that many** test-account rows in Verification Info (minimum **1**, typical **6–12** if you selected all groups).
3. Use **Account 1** text below for row 1, **Account 2** for row 2, etc. (through Account 12). If you need more than 12, email support@iptvwebplayer.org — we can enable `samsung_review_13` … `_20`.

**Shared for every row:**

| Field | Value |
|-------|--------|
| Server URL | `https://iptvwebplayer.org/api/review-panel` |
| Password | `StreamlyReview2026` |

### Account 1 (model group 1)

```
Login: Xtream
Server URL: https://iptvwebplayer.org/api/review-panel
Username: samsung_review
Password: StreamlyReview2026

Same sample catalog as all QA accounts (Live TV, Movies, Series, Search).
No ads / no premium tier. Use this account only on one test TV at a time.

Steps: Streamly → Xtream → enter fields → Sign in → play any channel or title.
Return key exits player. App ID: 3202606046491
```

### Account 2 (model group 2)

```
Login: Xtream
Server URL: https://iptvwebplayer.org/api/review-panel
Username: samsung_review_2
Password: StreamlyReview2026

Identical content to Account 1 — reserved for parallel model-group testing.
```

### Account 3 (model group 3)

```
Login: Xtream
Server URL: https://iptvwebplayer.org/api/review-panel
Username: samsung_review_3
Password: StreamlyReview2026

Identical content to Account 1 — reserved for parallel model-group testing.
```

### Account 4 (model group 4)

```
Username: samsung_review_4
Password: StreamlyReview2026
Server URL: https://iptvwebplayer.org/api/review-panel
(Same instructions as Account 1.)
```

### Account 5 (model group 5)

```
Username: samsung_review_5
Password: StreamlyReview2026
Server URL: https://iptvwebplayer.org/api/review-panel
(Same instructions as Account 1.)
```

### Account 6 (model group 6)

```
Username: samsung_review_6
Password: StreamlyReview2026
Server URL: https://iptvwebplayer.org/api/review-panel
(Same instructions as Account 1.)
```

### Accounts 7–12

Same pattern: `samsung_review_7` … `samsung_review_12`, same password and server URL.

### If the form has fewer rows than model groups

You **must** add rows until count ≥ model groups, or Samsung may fail verification for “insufficient test accounts.”

### If the form has one big text box (not per-row)

Paste **all** accounts you need in one block:

```
PARALLEL QA ACCOUNTS (one username per model group — same password & playlist):

Server: https://iptvwebplayer.org/api/review-panel
Password: StreamlyReview2026

MG1: samsung_review
MG2: samsung_review_2
MG3: samsung_review_3
MG4: samsung_review_4
MG5: samsung_review_5
MG6: samsung_review_6
(continue through samsung_review_N where N = number of model groups)

Streamly has no account-tier differences (no ads/premium/4K splits).
All accounts: Live TV + Movies + Series + Search with public sample streams only.
```

**Voucher code:** leave empty (app is free, no IAP).

---

## 4. Save → Distribute

After Save, open **Distribute** → select model groups → **Request release**.

**Reminder:** model-group count here must match the number of test-account rows you entered above.

---

## Canada (start in parallel — do not wait)

1. Seller Office → **1:1 Q&A** (top right chat icon).
2. Paste the message from `SAMSUNG_CANADA_PARTNERSHIP.md` (same folder).
3. Continue US submission now; Canada store unlocks after Partner approval.
