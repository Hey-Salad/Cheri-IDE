# GitHub Release Workflow

## ✅ What's Already Done

1. ✅ All code committed to `main` branch
2. ✅ Version tag `v1.0.2` created
3. ✅ AppImage built: `release/Cheri-1.0.2-arm64.AppImage` (138 MB)
4. ✅ Documentation complete (README, MIGRATION, BUILD_GUIDE, RELEASE_NOTES)
5. ✅ CLI installer created: `install-pi.sh`

---

## 📤 Step 1: Push to GitHub

```bash
cd /home/admin/BrilliantCode

# Push commits
git push origin main

# Push tag
git push origin v1.0.2
```

---

## 🚀 Step 2: Create GitHub Release

### Option A: Using GitHub CLI (gh)

```bash
# Create release with the AppImage
gh release create v1.0.2 \
  release/Cheri-1.0.2-arm64.AppImage \
  --title "Cheri v1.0.2 - AI that remembers your code" \
  --notes-file RELEASE_NOTES.md \
  --prerelease
```

### Option B: Using GitHub Web UI

1. Go to: https://github.com/Hey-Salad/cheri/releases/new
2. Choose tag: `v1.0.2`
3. Release title: `Cheri v1.0.2 - AI that remembers your code`
4. Description: Copy from `RELEASE_NOTES.md`
5. Upload file: `release/Cheri-1.0.2-arm64.AppImage`
6. Check "Set as a pre-release" (until fully tested)
7. Click "Publish release"

---

## 📦 What Users Will Get

### Raspberry Pi 5 Installation

**One-line install**:
```bash
curl -sSL https://raw.githubusercontent.com/Hey-Salad/cheri/main/install-pi.sh | bash
```

**Manual install**:
```bash
wget https://github.com/Hey-Salad/cheri/releases/download/v1.0.2/Cheri-1.0.2-arm64.AppImage
chmod +x Cheri-1.0.2-arm64.AppImage
./Cheri-1.0.2-arm64.AppImage
```

---

## 🍎 Step 3: Build for macOS M1

**On your MacBook M1:**

```bash
# 1. Clone or pull latest code
git clone https://github.com/Hey-Salad/cheri.git
cd cheri
git checkout v1.0.2

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Build macOS M1 package
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish=never
```

This creates:
- `release/Cheri-1.0.2-arm64.dmg` (Mac installer)
- `release/Cheri-1.0.2-arm64-mac.zip` (Mac archive)

---

## 📤 Step 4: Add macOS Build to Release

After building on your M1 Mac:

### Option A: GitHub CLI
```bash
gh release upload v1.0.2 \
  release/Cheri-1.0.2-arm64.dmg \
  release/Cheri-1.0.2-arm64-mac.zip
```

### Option B: GitHub Web UI
1. Go to: https://github.com/Hey-Salad/cheri/releases/tag/v1.0.2
2. Click "Edit release"
3. Upload: `Cheri-1.0.2-arm64.dmg` and `Cheri-1.0.2-arm64-mac.zip`
4. Click "Update release"

---

## ✅ Final Release Checklist

### Before Publishing
- [ ] All code pushed to GitHub
- [ ] Tag v1.0.2 pushed
- [ ] Raspberry Pi AppImage uploaded
- [ ] macOS DMG built and uploaded
- [ ] Release notes complete
- [ ] Install script working

### Testing
- [ ] Test Pi AppImage installation
- [ ] Test Mac DMG installation
- [ ] Verify branding ("Cheri by HeySalad")
- [ ] Verify plain black UI
- [ ] Test performance improvements
- [ ] Test data migration

### Documentation
- [ ] README.md updated
- [ ] MIGRATION.md complete
- [ ] BUILD_GUIDE.md accurate
- [ ] RELEASE_NOTES.md detailed

---

## 🎯 Installation URLs (After Release)

### Raspberry Pi 5
```bash
# Quick install
curl -sSL https://raw.githubusercontent.com/Hey-Salad/cheri/main/install-pi.sh | bash

# Manual download
wget https://github.com/Hey-Salad/cheri/releases/download/v1.0.2/Cheri-1.0.2-arm64.AppImage
```

### macOS M1/M2
```bash
# Direct download
https://github.com/Hey-Salad/cheri/releases/download/v1.0.2/Cheri-1.0.2-arm64.dmg
```

---

## 📊 Release Stats

**Raspberry Pi Build**:
- File: `Cheri-1.0.2-arm64.AppImage`
- Size: 138 MB
- Platform: Linux ARM64
- Status: ✅ Built and ready

**macOS Build**:
- File: `Cheri-1.0.2-arm64.dmg`
- Size: ~TBD (typically 150-200 MB)
- Platform: macOS ARM64 (M1/M2)
- Status: ⏳ Build on M1 Mac

---

## 🔐 Code Signing (Optional)

### macOS Signing

If you want to sign the macOS build for easier distribution:

```bash
# Set environment variables
export MAC_SIGN_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_API_KEY=/path/to/AuthKey_KEYID.p8
export APPLE_API_KEY_ID=YOUR_KEY_ID
export APPLE_API_ISSUER=YOUR_ISSUER_ID

# Build with signing
npm run dist
```

This requires:
- Apple Developer account ($99/year)
- Developer ID certificate
- App-specific password for notarization

---

## 📢 Announcement Template

After release, announce on:

**GitHub**:
```markdown
🎉 Cheri v1.0.2 is now available!

Complete rebrand from BrilliantCode with major performance improvements:
- 500-900ms faster startup
- 30-50MB less memory
- Plain black UI

Download: https://github.com/Hey-Salad/cheri/releases/tag/v1.0.2
```

**Twitter/X**:
```
🍒 Cheri v1.0.2 is live!

AI that remembers your code - now 50% faster 🚀

✅ Raspberry Pi 5
✅ macOS M1/M2
✅ Plain black UI

Download: https://github.com/Hey-Salad/cheri/releases/tag/v1.0.2

#AI #Coding #OpenSource
```

---

## 🆘 Troubleshooting

### Push fails - "remote contains work"
```bash
git pull --rebase origin main
git push origin main
```

### Tag already exists
```bash
git tag -d v1.0.2                    # Delete local
git push origin :refs/tags/v1.0.2   # Delete remote
git tag -a v1.0.2 -m "New message"  # Recreate
git push origin v1.0.2              # Push new tag
```

### Release upload fails
- Check file size limits (2GB max for GitHub)
- Compress if needed: `gzip Cheri-1.0.2-arm64.AppImage`
- Use GitHub CLI for large files: `gh release upload`

---

**Ready to push? Let's get Cheri out there!** 🚀
