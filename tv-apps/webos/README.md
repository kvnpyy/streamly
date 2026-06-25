# LG webOS package

## Prerequisites

- [webOS TV SDK](https://webostv.developer.lge.com/develop/sdk/installing-the-sdk)
- LG Seller Lounge account

## Configure

1. Edit `index.html` iframe URL to your Streamly instance.
2. Add `icon.png` (80×80 and 130×130 used by webOS; provide 512×512 for store).
3. Update `appinfo.json` `id` / `vendor` if rebranding.

## Build & install (CLI)

Unsigned package (repo script):

```bash
npm run tv:store:package
# → tv-apps/dist/streamly-lg-webos-1.0.0-unsigned.ipk
```

Signed install for device testing:

```bash
cd tv-apps/webos
ares-package .
ares-install --device my-tv org.streamly.iptv_1.0.0_all.ipk
ares-launch --device my-tv org.streamly.iptv
```

## Submit

[LG Seller Lounge](https://seller.lgappstv.com/) → register web app → upload `.ipk` and marketing assets.

## Notes

- webOS apps run in WebKit; Streamly already detects webOS UAs and enables TV shell mode.
- Use PIN pairing (`/login` → Link with PIN) — avoid typing long passwords on the magic remote.
