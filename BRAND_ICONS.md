# HeySalad Brand Icon Uniformity

## ✅ Completed: Uniform Cherry Icons Across All Products

### Brand Colors
- **Cherry Red**: `#ed4c4c` (primary cherry color)
- **Peach**: `#faa09a` (highlights)
- **Light Peach**: `#ffd0cd` (backgrounds)
- **White**: `#ffffff` (text on black)
- **Green Stems**: `#10B981` (cherry stems and leaf)

### Typography
- **Grandstander** (Bold 700): For "Cheri" branding
- **Figtree** (Regular 400, Semibold 600): For "HeySalad®" and body text

---

## 🍒 Simple Two-Cherry Icon Design

All HeySalad products now use the **same simple two-cherry icon**:

```
   🌿 (green leaf)
  /   \
 🍒   🍒 (two red cherries)
```

**Design principles**:
- Clean and simple (recognizable at all sizes)
- Only brand colors (no other colors)
- Consistent across all platforms
- Scalable from 16px to 1024px

---

## 📦 Products Updated

### 1. Cheri IDE (Desktop App)
**Location**: `/home/admin/BrilliantCode`

**Updated**:
- ✅ `resources/cheri-icon.svg` - Master SVG icon
- ✅ `resources/cheri-{16,32,48,64,128,256,512,1024}.png` - All sizes
- ✅ `resources/cheri.ico` - Windows icon
- ✅ `resources/favicon.svg` - Browser favicon
- ✅ `resources/favicon.ico` - Browser favicon (ICO format)
- ✅ `resources/heysalad-logo-white.svg` - HeySalad logo for black backgrounds
- ✅ `src/renderer/index.html` - Added favicon links
- ✅ `src/renderer/welcome.html` - Added favicon links
- ✅ `electron-builder.config.cjs` - macOS, Windows, Linux icon config

**Platforms**:
- macOS: Uses PNG (will convert to ICNS on Mac during build)
- Windows: Uses `cheri.ico`
- Linux: Uses PNG files for AppImage
- Browser (renderer): Uses `favicon.svg` and `favicon.ico`

**Status**: ✅ Pushed to GitHub (Hey-Salad/Cheri-IDE)

---

### 2. Cheri-AI (Web IDE / Cloud IDE)
**Location**: `/home/admin/Cheri-AI`

**Updated**:
- ✅ `public/icon.svg` - Replaced complex icon with simple two-cherry
- ✅ `public/favicon.svg` - Updated favicon

**Before**: Complex icon with background circle, gradients, and elaborate highlights
**After**: Simple two-cherry icon matching all other products

**Status**: ✅ Committed locally (not pushed yet)

---

### 3. Cloud-IDE (VSCode Extension + Chrome Extension)
**Location**: `/home/admin/cloud-ide`

**Updated**:
- ✅ `vscode-extension/media/cherry-icon.svg` - VSCode icon
- ✅ `chrome-extension/icons/icon-16.png` - Chrome 16px
- ✅ `chrome-extension/icons/icon-48.png` - Chrome 48px
- ✅ `chrome-extension/icons/icon-128.png` - Chrome 128px

**Status**: ✅ Committed locally (not pushed yet)

---

## 📐 Icon Sizes Generated

All icons available in these sizes:
- **16x16px** - Favicons, chrome extension small
- **32x32px** - Favicons, Windows
- **48x48px** - Chrome extension, taskbar
- **64x64px** - Linux menu
- **128x128px** - Chrome extension, app stores
- **256x256px** - macOS, Windows installer
- **512x512px** - App icon, website
- **1024x1024px** - High-res master, macOS ICNS source

---

## 🎨 Usage Guidelines

### Desktop App (Cheri IDE)
- **App icon**: Shows in dock/taskbar
- **Window icon**: Shows in title bar
- **About screen**: Uses HeySalad white logo
- **Favicon**: Shows in terminal/browser views

### Website (Cheri-AI)
- **Favicon**: `<link rel="icon" href="/favicon.svg">`
- **App icon**: `<link rel="apple-touch-icon" href="/icon.svg">`
- **Logo**: HeySalad white logo on black backgrounds

### Browser Extensions
- **Chrome**: Uses PNG icons (16, 48, 128px)
- **VSCode**: Uses SVG icon in sidebar
- **All tooltips**: "Cheri by HeySalad"

---

## ⚠️ Brand Rules

1. **HeySalad® Color Rule**: The word "HeySalad" with ® symbol must ALWAYS be **black or white**, NEVER colored
2. **Cheri Color Rule**: The word "Cheri" can use cherry red (#ed4c4c)
3. **Icon Colors**: Cherry icons use ONLY:
   - Cherry red (#ed4c4c)
   - Peach (#faa09a) for highlights
   - Green (#10B981) for stems
   - White for highlights
4. **Spacing**: Keep adequate spacing around cherries for easy recognition
5. **Background**: Icons work on both light and dark backgrounds

---

## 🔄 Next Steps

### Immediate
- [ ] Push cloud-ide changes to GitHub
- [ ] Push Cheri-AI changes to GitHub
- [ ] Update website favicons
- [ ] Test all icons across platforms

### Mac Build
- [ ] Build Cheri IDE on M1 Mac
- [ ] Generate proper ICNS file from PNG
- [ ] Upload DMG with cherry icon to GitHub release

### Future
- [ ] App store screenshots with cherry branding
- [ ] Marketing materials with consistent icons
- [ ] Social media assets (Twitter cards, OG images)
- [ ] Documentation updates with new icons

---

## 📝 Files Reference

**Master Icon**: `/home/admin/BrilliantCode/resources/cheri-icon.svg`

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none">
  <!-- Two cherries with stems -->
  <path d="M256 120 C 240 80, 200 50, 180 80" stroke="#10B981" stroke-width="12"/>
  <path d="M256 120 C 272 80, 312 50, 332 80" stroke="#10B981" stroke-width="12"/>
  <path d="M256 120 Q 290 100 300 110 Q 290 120 256 120" fill="#10B981"/>
  <circle cx="180" cy="320" r="140" fill="#ED4C4C"/>
  <circle cx="332" cy="320" r="140" fill="#ED4C4C"/>
  <!-- Highlights and shadows -->
</svg>
```

**All sizes generated from this master SVG using ImageMagick.**

---

## ✅ Brand Consistency Achieved

All HeySalad products now have:
- ✅ Same cherry icon design
- ✅ Consistent brand colors
- ✅ Uniform typography (Grandstander + Figtree)
- ✅ Professional polish
- ✅ Cross-platform support

**The HeySalad brand is now unified! 🍒**
