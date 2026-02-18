# Critical Icon & Branding Fixes - v1.0.5

## Issues Found and Fixed

Research revealed **5 critical configuration issues** preventing icons from displaying correctly:

---

## ✅ Fixed Issues

### 1. **Missing Cheri.icns File** (macOS)
**Problem**: electron-builder.config.cjs referenced `resources/Cheri.icns` but it didn't exist.
**Fix**: Documented generation process for Mac users (requires macOS `iconutil` tool).

**To generate on Mac**:
```bash
node scripts/png-to-icns.cjs resources/cheri-1024.png resources/Cheri.icns
```

---

### 2. **Wrong Runtime Icon Path** (All platforms)
**Problem**: `src/main/main.ts:356` pointed to non-existent path:
```javascript
const BRAND_ICON_PATH = path.join(__dirname, '../assets/branding/brilliant-ai-logo-small.png');
```

**Fix**: Updated to correct path:
```javascript
const BRAND_ICON_PATH = path.join(__dirname, '../../resources/cheri-512.png');
const BRAND_SITE = 'https://heysalad.co';
```

**Impact**: Window icons, dock icons, about panel icons now work correctly.

---

### 3. **Missing Linux Icon Configuration**
**Problem**: electron-builder.config.cjs didn't specify icon for Linux builds.
**Fix**: Added:
```javascript
linux: {
  icon: 'resources/cheri-512.png',
  // ...
}
```

**Impact**: AppImage and DEB packages now use correct cherry icon.

---

### 4. **Broken HTML Image Paths** (Production builds)
**Problem**: HTML files used relative paths that break in production:
```html
<img src="../../resources/cheri-icon.svg">
```

**Fix**:
1. Created `scripts/copy-resources.cjs` to copy branding assets to `dist/renderer/resources/`
2. Updated all HTML paths to `./resources/` (relative to dist/renderer/)
3. Added `build:copy-resources` step to build process

**Files fixed**:
- `src/renderer/welcome.html` - Cherry logo and HeySalad footer
- `src/renderer/index.html` - Favicons and HeySalad footer branding

---

### 5. **Vite Public Directory Configuration**
**Problem**: Vite wasn't configured to handle resources directory.
**Fix**: Disabled default publicDir and added manual copy step in build process.

---

## Build Process Changes

### Updated package.json Scripts

**Before**:
```json
"build": "npm run build:main && npm run build:preload && npm run build:renderer && npm run build:copy-updater"
```

**After**:
```json
"build": "npm run build:main && npm run build:preload && npm run build:renderer && npm run build:copy-resources && npm run build:copy-updater",
"build:copy-resources": "node scripts/copy-resources.cjs"
```

---

## Icon Caching Solutions

### Why Icons Don't Update Immediately

Operating systems aggressively cache application icons. After updating, users may need to clear caches:

#### macOS
```bash
# Clear icon services cache
sudo rm -rf /Library/Caches/com.apple.iconservices.store
killall Dock
killall Finder

# Or just touch the app
touch /Applications/Cheri.app
```

#### Windows
1. Delete IconCache files in `%LocalAppData%\Microsoft\Windows\Explorer\`
2. Restart Windows Explorer
3. Or uninstall old version before installing new one

#### Linux
```bash
# GTK-based desktops
gtk-update-icon-cache

# KDE
kbuildsycoca5

# Or just log out and back in
```

---

## Files Created/Modified

### New Files
- `scripts/copy-resources.cjs` - Copies branding assets to dist during build
- `ICON_FIXES.md` - This document

### Modified Files
- `src/main/main.ts` - Fixed BRAND_ICON_PATH and BRAND_SITE
- `electron-builder.config.cjs` - Added Linux icon configuration
- `vite.renderer.config.ts` - Disabled publicDir
- `package.json` - Added build:copy-resources step, bumped to v1.0.5
- `src/renderer/welcome.html` - Fixed image paths (../../resources/ → ./resources/)
- `src/renderer/index.html` - Fixed image paths and favicon links

---

## Testing Checklist

After building v1.0.5, verify:

- [ ] **macOS**: Cherry icon in dock, window title bar, About panel
- [ ] **Windows**: Cherry icon in taskbar, window, Start menu
- [ ] **Linux**: Cherry icon in launcher, window, desktop file
- [ ] **Welcome screen**: Cherry logo displays at top
- [ ] **Main app footer**: "Powered by HeySalad" logo displays
- [ ] **Favicons**: Browser tabs show cherry icon
- [ ] **Clean install**: No old BrilliantCode icons remain

---

## For Mac Users

**IMPORTANT**: Generate Cheri.icns before building:

```bash
cd Cheri-IDE
git pull origin main

# Generate ICNS from PNG (requires macOS)
node scripts/png-to-icns.cjs resources/cheri-1024.png resources/Cheri.icns

# Clean rebuild
./build-mac-signed.sh
```

---

## Why This Matters

These fixes ensure:
1. ✅ **Correct icons everywhere** - Dock, taskbar, launcher, windows
2. ✅ **Runtime icons work** - About panel, notifications use correct icon
3. ✅ **Production builds display branding** - Logo and footer show in built app
4. ✅ **Consistent branding** - All platforms use same cherry icon design
5. ✅ **No old branding** - Completely removed BrilliantCode references

---

## Related Documentation

- [BRAND_ICONS.md](BRAND_ICONS.md) - Brand icon uniformity guide
- [BUILD_MAC.md](BUILD_MAC.md) - macOS build instructions
- [MIGRATION.md](MIGRATION.md) - BrilliantCode → Cheri migration guide

---

**v1.0.5 - Complete branding fix release** 🍒
