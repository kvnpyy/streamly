# Samsung Tizen package

## Prerequisites

- [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setup-guide.html) with TV extensions
- Samsung Seller Office account

## Configure

1. Edit `index.html` — set the iframe `src` to your Streamly URL (default: `https://iptvwebplayer.org/login`).
2. Add `icon.png` (117×117 minimum; 512×512 recommended for store listing).
3. Update `config.xml` `id`, `author`, and `description` if rebranding.

## Build

```bash
cd tv-apps/tizen
# Create project in Tizen Studio pointing at this folder, or:
tizen package -t wgt -s <your-certificate-profile> .
```

Output: `Streamly.wgt` (name varies by project).

## Test on TV

1. Enable Developer Mode on the Samsung TV (Apps → 12345 on remote).
2. `sdb connect <TV-IP>`
3. `tizen install -n Streamly.wgt -t <TV-NAME>`

## Submit

[Samsung Seller Office](https://seller.samsungapps.com/) → TV Apps → upload `.wgt`, screenshots, privacy URL.

Review typically checks stability, navigation with D-pad, and that you are not selling pirated content.
