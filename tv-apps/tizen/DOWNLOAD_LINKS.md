# Tizen SDK — where to download (verified links)

Samsung **moved** the old download page. `developer.tizen.org/.../download` now redirects to [samsungtizenos.com](https://samsungtizenos.com/) — documentation only. The page you may land on (`.../dotnet/vscode/...`) is for **.NET + VS Code**, not the TV web signing tools Streamly needs.

## Recommended: CLI installer (~326 MB)

Best for Streamly — sign and package `.wgt` without the full 1.8 GB IDE.

**Direct download (macOS):**

https://download.tizen.org/sdk/Installer/tizen-sdk_10.0/web-cli_Tizen_SDK_10.0_macos-64.bin

```bash
cd ~/Downloads
chmod +x web-cli_Tizen_SDK_10.0_macos-64.bin
./web-cli_Tizen_SDK_10.0_macos-64.bin
```

Or from the project:

```bash
npm run tv:store:tizen-setup -- --open
```

## Other installers

| Installer | Size | URL |
|-----------|------|-----|
| Web IDE (GUI) | ~700 MB | https://download.tizen.org/sdk/Installer/tizen-sdk_10.0/web-ide_Tizen_SDK_10.0_macos-64.dmg |
| Full Baseline | ~1.8 GB | https://download.tizen.org/sdk/Installer/Latest/Baseline_Tizen_Studio_macos-64.dmg |
| All SDK 10 files | — | https://download.tizen.org/sdk/Installer/tizen-sdk_10.0/ |

## After install

1. **Package Manager** → Extension SDK → install **TV Extensions** + **Samsung Certificate Extension** (2.0.73+).
   Official guide: [Installing TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)

2. Add to `~/.zshrc`:
   ```bash
   export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
   ```

3. **Certificate Manager** → create Samsung TV profile.

4. Sign Streamly:
   ```bash
   TIZEN_CERT_PROFILE=your-profile-name npm run tv:store:sign-tizen
   ```

Full beginner walkthrough: [SAMSUNG_BEGINNER_GUIDE.md](./SAMSUNG_BEGINNER_GUIDE.md)
