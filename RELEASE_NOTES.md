# Cheri v1.0.2 Release Notes

## 🎉 Introducing Cheri by HeySalad

**BrilliantCode has been rebranded to Cheri by HeySalad** - AI that remembers your code.

This release includes complete rebranding, major performance improvements, and a developer-friendly plain black UI.

---

## 🆕 What's New

### Rebranding
- **New Name**: Cheri by HeySalad®
- **New Tagline**: "AI that remembers your code"
- **New Protocol**: `cheri://` (was `brilliantcode://`)
- **New Package**: `@heysalad/cheri`
- **Plain Black UI**: VS Code-style interface, easy on eyes for all-day coding

### Performance Improvements

#### ⚡ Startup Speed: 500-900ms Faster (15-45% improvement)
- Deferred auto-updater initialization (+200ms)
- Lazy-loaded syntax highlighting (only 5 languages at startup, rest on-demand) (+400KB bundle reduction, +30-50ms)
- Code splitting for xterm, highlight.js, Monaco editor (+150KB deferred)

#### 💾 Memory Usage: 30-50MB Reduction
- Fixed terminal PTY cleanup on window close (20-40MB saved)
- LRU cache for directory listings (prevents unbounded growth, max 100 entries)
- Proper cleanup of terminal write buffers
- Long-running sessions (500+ messages): 100-200MB savings

#### 🚀 Runtime Performance: 40-60% Less IPC Traffic
- Terminal resize debouncing (150ms delay, 60-80% IPC reduction)
- Terminal write batching (16ms/4KB threshold, 40-50% IPC overhead reduction)

---

## 📦 Downloads

### Raspberry Pi 5 (Linux ARM64)
- **AppImage**: `Cheri-1.0.2-arm64.AppImage` (138 MB)

**Quick Install**:
```bash
curl -sSL https://raw.githubusercontent.com/Hey-Salad/cheri/main/install-pi.sh | bash
```

**Manual Install**:
```bash
wget https://github.com/Hey-Salad/cheri/releases/download/v1.0.2/Cheri-1.0.2-arm64.AppImage
chmod +x Cheri-1.0.2-arm64.AppImage
./Cheri-1.0.2-arm64.AppImage
```

### macOS M1/M2 (ARM64)
- **DMG**: `Cheri-1.0.2-arm64.dmg`
- **ZIP**: `Cheri-1.0.2-arm64-mac.zip`

Download, open DMG, drag to Applications.

---

## 🔄 Migration from BrilliantCode

### Automatic Migration
Your data automatically migrates from `~/.brilliantcode` to `~/.cheri` on first launch.

**What gets migrated**:
- ✅ All chat sessions and history
- ✅ API keys and model configurations
- ✅ MCP server configurations
- ✅ Custom model settings
- ✅ Project preferences

### Environment Variables
Old variables still work, but we recommend updating:

| Old | New |
|-----|-----|
| `BRILLIANTCODE_DEFAULT_MODEL` | `CHERI_DEFAULT_MODEL` |
| `BRILLIANTCODE_UPDATE_FEED_URL` | `CHERI_UPDATE_FEED_URL` |
| `BRILLIANTCODE_VERSION_CHECK_URL` | `CHERI_VERSION_CHECK_URL` |

See [MIGRATION.md](MIGRATION.md) for complete migration guide.

---

## ✨ Features

- 🧠 **AI with Memory** - Remembers your code and project context
- 🔧 **Autonomous Agent** - LLMs control terminals, browsers, and files
- 🎨 **Plain Black UI** - Developer-friendly, easy on eyes
- 🚀 **High Performance** - Fast startup, efficient memory usage
- 🔒 **Local First** - Everything runs on your machine
- 🌐 **Model Agnostic** - OpenAI, Anthropic, Azure, custom models
- 🔌 **MCP Support** - Model Context Protocol for extensibility

---

## 🐛 Bug Fixes

- Fixed terminal PTY memory leaks on window close
- Fixed unbounded directory cache growth
- Fixed terminal IPC flooding during window resize
- Improved terminal output batching for smoother rendering

---

## 🔧 Technical Details

### Breaking Changes
- Protocol changed: `brilliantcode://` → `cheri://`
- User data directory: `~/.brilliantcode` → `~/.cheri`
- Environment variable prefix: `BRILLIANTCODE_*` → `CHERI_*` (backward compatible)

### Dependencies
- Electron 37.10.3
- Monaco Editor 0.55.1
- XTerm 5.3.0
- OpenAI SDK 5.16.0
- Anthropic SDK 0.63.1

### Build Info
- Node.js 20+
- TypeScript 5.9.2
- Vite 7.1.5

---

## 📖 Documentation

- [README.md](README.md) - Getting started guide
- [MIGRATION.md](MIGRATION.md) - Migrating from BrilliantCode
- [BUILD_GUIDE.md](BUILD_GUIDE.md) - Building from source
- [DOCS.md](DOCS.md) - Technical documentation

---

## 🙏 Credits

**Cheri by HeySalad®** is built by **HeySalad Inc.**
584 Castro St, San Francisco, CA 94114

Based on BrilliantCode by Jennifer Olafenwa.

---

## 📝 Full Changelog

### Added
- Plain black UI theme (VS Code style)
- Performance optimizations (startup, memory, IPC)
- User data migration system
- Cheri branding and typography
- CLI installer for Raspberry Pi
- Comprehensive documentation

### Changed
- Rebranded BrilliantCode → Cheri by HeySalad
- Updated all UI text and branding
- Environment variable naming convention
- User data directory location
- Protocol scheme

### Fixed
- Terminal PTY cleanup on window close
- Directory cache unbounded growth
- Terminal resize IPC flooding
- Memory leaks in long sessions
- Terminal write buffering

### Performance
- 500-900ms faster startup
- 30-50MB less memory usage
- 40-60% reduction in IPC traffic

---

**Download now and experience AI that remembers your code!** 🍒

Visit: https://heysalad.co/cheri
