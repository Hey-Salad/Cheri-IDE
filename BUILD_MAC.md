# Build Cheri for macOS M1 (Signed)

Simple guide to build a properly signed Cheri DMG for your M1 Mac.

## Prerequisites

- macOS M1/M2 Mac
- Node.js 20+ installed
- Apple Developer account (you have: Team ID A24823SWLS)

## Quick Build (Signed & Ready to Install)

### 1. Clone on your M1 Mac

```bash
git clone https://github.com/Hey-Salad/Cheri-IDE.git
cd Cheri-IDE
git checkout v1.0.2
```

### 2. Run the build script

```bash
chmod +x build-mac-signed.sh
./build-mac-signed.sh
```

That's it! The script will:
- Install dependencies
- Build TypeScript
- Create a **signed DMG** using your Apple Developer certificate

### 3. Output

Find your signed installer at:
- `release/Cheri-1.0.2-arm64.dmg` ← Install this
- `release/Cheri-1.0.2-arm64-mac.zip` ← Archive version

### 4. Test It

```bash
# Open the DMG
open release/Cheri-1.0.2-arm64.dmg

# Drag Cheri to Applications
# Double-click to launch - no security warnings!
```

---

## Optional: Notarization (Recommended)

For the best user experience (no "unidentified developer" warnings), enable notarization:

### Get an App-Specific Password

1. Go to https://appleid.apple.com/account/manage
2. Sign in with your Apple ID
3. Under "Security" → "App-Specific Passwords" → Click "+"
4. Label it "Cheri Notarization"
5. Copy the password (format: `xxxx-xxxx-xxxx-xxxx`)

### Update build-mac-signed.sh

Edit the script and uncomment these lines:

```bash
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # Your password here
export APPLE_TEAM_ID="A24823SWLS"
```

Then run the build again. Notarization takes 2-5 minutes but produces a fully trusted DMG.

---

## Upload to GitHub

After building:

```bash
gh release upload v1.0.2 \
  release/Cheri-1.0.2-arm64.dmg \
  release/Cheri-1.0.2-arm64-mac.zip
```

Or drag-and-drop at: https://github.com/Hey-Salad/Cheri-IDE/releases/tag/v1.0.2

---

## Troubleshooting

### "No signing identity found"

Open **Keychain Access** on your Mac:
1. Search for "Developer ID Application"
2. You should see: `Developer ID Application: SALADHR TECHNOLOGY LTD (A24823SWLS)`
3. If not, download it from https://developer.apple.com/account/resources/certificates/list

### Build fails with "module not found"

```bash
rm -rf node_modules package-lock.json
npm install
./build-mac-signed.sh
```

### Want to build unsigned (for testing)?

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish=never
```

---

**Questions?** Check [BUILD_GUIDE.md](BUILD_GUIDE.md) for more details.
