# Samsung approval readiness — honest checklist

Before uploading `Streamly-App-UI-Description-v1.0.2.pptx`, review this against [Samsung's UI Description guide](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/application-ui-description.html).

## What the updated PPTX now covers

| Samsung requirement | Status |
|---------------------|--------|
| Title + revision history + app version | ✅ |
| UI structure — all screens as named boxes | ✅ (Login, Home, Live, Movies, Detail, Series, Search, Settings, Player) |
| Use cases — login, browse, play, search, settings | ✅ UC1–UC9 |
| Test account info for login feature | ✅ 12 parallel QA usernames (`samsung_review` … `_12`) |
| Menu screenshots + element tables | ✅ All 9 screens: Login, Settings, Home, Live, Player, Movies, Detail, Series, Search |
| Remote key policy (Return/Exit mandatory) | ✅ |
| Language options | ✅ English only, explicitly stated |
| English screenshots | ✅ |

Regenerate: `npm run tv:store:app-description`

---

## Remaining risks (not 100% guaranteed)

### 1. Test credentials — parallel model groups

Samsung requires **≥1 test account per model group** (simultaneous testing). Streamly has **no** ads/premium/4K tiers — every QA username gets the **same** playlist. Use **distinct usernames**, same password:

| Field | Value |
|-------|--------|
| Server URL | `https://iptvwebplayer.org/api/review-panel` |
| Password | `StreamlyReview2026` |
| Usernames | `samsung_review`, `samsung_review_2` … `samsung_review_12` |

Count model groups on **Distribute** → add that many rows in Verification Info. See `SAMSUNG_VERIFICATION_FILL_IN.md` for copy-paste per row.

Deploy review panel to production before Samsung tests.

### 2. Videos category + IPTV player scrutiny

Samsung reviews **Videos** category apps carefully. Streamly is a **player only** (BYO subscription). Your listing text must say this clearly. Rejection for "content policy" is possible even with perfect UI docs.

### 3. Title must match package

Default language **App Title** = **`Streamly`** exactly (matches `config.xml` `<name>`).

### 4. Verification Info form (separate from PPTX)

Must also complete on Seller Office:

- **Geo IP block:** Unuse
- **Test account:** paste from `SAMSUNG_VERIFICATION_FILL_IN.md` (+ real creds if you have them)
- **2–3 test account rows** if testing multiple model groups in parallel

### 5. App must work when reviewers test

- `https://iptvwebplayer.org/login` must load on Samsung TV browser
- PIN pairing must work (production SQLite / `DATABASE_URL` shared)
- Return key must exit player

---

## Verdict

| Question | Answer |
|----------|--------|
| Is the PPTX **structurally complete** for Samsung's template? | **Yes** (after latest regenerate) |
| Is it **guaranteed** approval? | **No** — nobody can guarantee Samsung QA |
| Good enough to submit? | **Yes** — after deploying review panel to production |
| Biggest likely failure? | Content policy (Videos category) or app bugs during QA play-through |

---

## Verification Info — paste after uploading PPTX

**Geo IP:** Unuse

**Test account (paste into Verification Info):**

```
Server URL:  https://iptvwebplayer.org/api/review-panel
Username:    samsung_review
Password:    StreamlyReview2026

Steps: TV app → Xtream tab → enter above → Sign in → play Live TV or Movies.
PIN alternative: same creds on PC → Settings → Link TV PIN → enter on TV.
Support: support@iptvwebplayer.org | App ID: 3202606046491
```

Add identical rows for Account 2 and Account 3 if the form allows multiple entries.
