# Migrating from BrilliantCode to Cheri

If you previously used BrilliantCode, this guide will help you migrate to Cheri by HeySalad.

## What Changed?

**BrilliantCode has been rebranded to Cheri by HeySalad**, with the tagline "AI that remembers your code." The core functionality remains the same, but with significant performance improvements and a cleaner, developer-friendly UI.

### New Branding

- **Name**: BrilliantCode → Cheri
- **Company**: Brilliant AI → HeySalad Inc.
- **Protocol**: `brilliantcode://` → `cheri://`
- **Package**: `brilliantcode` → `@heysalad/cheri`
- **App ID**: `co.brilliantai.brilliantcode` → `co.heysalad.cheri`

### UI Changes

- **Plain Black Theme**: Removed bright cherry red/peach gradients for a VS Code-style monochrome interface
- **Developer-Friendly**: Easy on the eyes for all-day coding
- **Typography**: Grandstander font for "Cheri" branding, Figtree for body text

### Performance Improvements

✅ **500-900ms faster startup**
- Deferred auto-updater initialization
- Lazy-loaded syntax highlighting (only 5 languages at startup)
- Code splitting for Monaco, XTerm, and highlight.js

✅ **30-50MB memory reduction**
- Fixed terminal PTY cleanup on window close
- LRU cache for directory listings (prevents unbounded growth)
- Proper cleanup of terminal write buffers

✅ **40-60% less IPC traffic**
- Terminal resize debouncing (150ms)
- Terminal write batching (16ms/4KB threshold)

## Automatic Migration

### Data Migration

**Your data will automatically migrate on first launch** from:
```
~/.brilliantcode → ~/.cheri
```

This includes:
- All chat sessions and history
- API keys and model configurations
- MCP server configurations
- Project preferences
- Custom model settings

The migration happens once during the first app startup. Your original `~/.brilliantcode` directory will be renamed to `~/.cheri`.

### What Gets Migrated

✅ **Sessions** - All chat history and context
✅ **API Keys** - OpenAI, Anthropic, Azure credentials
✅ **MCP Configs** - Model Context Protocol servers
✅ **Settings** - Custom models, hidden models, preferences
✅ **Workspaces** - Recent project directories

## Manual Migration (if needed)

If automatic migration fails or you want to migrate manually:

### 1. Backup Your Data

```bash
# Create a backup
cp -r ~/.brilliantcode ~/.brilliantcode-backup
```

### 2. Move Data Directory

```bash
# Rename the directory
mv ~/.brilliantcode ~/.cheri
```

### 3. Verify Migration

Launch Cheri and check:
- Your API keys are present (AI → API Keys)
- Chat history is loaded
- MCP servers are configured (AI → MCP Servers)

## Protocol Changes

### Deep Links

If you used deep links with BrilliantCode:

**Old**: `brilliantcode://open?path=/project`
**New**: `cheri://open?path=/project`

Update any scripts, bookmarks, or integrations that use deep links.

## Environment Variables

Environment variables have been renamed for consistency:

### Updated Variable Names

| Old (BrilliantCode) | New (Cheri) |
|---------------------|-------------|
| `BRILLIANTCODE_DEFAULT_MODEL` | `CHERI_DEFAULT_MODEL` |
| `BRILLIANTCODE_UPDATE_FEED_URL` | `CHERI_UPDATE_FEED_URL` |
| `BRILLIANTCODE_VERSION_CHECK_URL` | `CHERI_VERSION_CHECK_URL` |
| `BRILLIANTCODE_TOOL_IMAGE_MAX_DIM` | `CHERI_TOOL_IMAGE_MAX_DIM` |
| `BRILLIANTCODE_TOOL_TEXT_MAX_CHARS` | `CHERI_TOOL_TEXT_MAX_CHARS` |

**Note**: Old environment variables still work for backward compatibility, but we recommend updating to the new naming convention.

### Example .env File

```bash
# Old (still works)
BRILLIANTCODE_DEFAULT_MODEL=gpt-4

# New (recommended)
CHERI_DEFAULT_MODEL=gpt-4
```

## Build/Development Changes

If you're building from source:

### Package Name

```bash
# Old
npm install brilliantcode

# New
npm install @heysalad/cheri
```

### App Identifier

**macOS**:
- Old: `co.brilliantai.brilliantcode`
- New: `co.heysalad.cheri`

**Protocols**:
- Old: `brilliantcode://`
- New: `cheri://`

## Troubleshooting

### Migration Failed

If automatic migration fails:

1. **Check file permissions**:
   ```bash
   ls -la ~/.brilliantcode
   ```

2. **Manual migration**:
   ```bash
   mv ~/.brilliantcode ~/.cheri
   ```

3. **Check logs**: Look for migration errors in the console

### API Keys Missing

If API keys didn't migrate:

1. Go to **AI → API Keys**
2. Re-enter your keys:
   - OpenAI API Key
   - Anthropic API Key
   - Azure OpenAI (if used)

### MCP Servers Not Loading

If MCP servers didn't migrate:

1. Check `~/.cheri/mcp.json` exists
2. Go to **AI → MCP Servers**
3. Reconnect to your servers

### Sessions Lost

If chat sessions didn't migrate:

1. Check `~/.cheri/sessions/` directory exists
2. Try restoring from backup:
   ```bash
   cp -r ~/.brilliantcode-backup/sessions ~/.cheri/sessions
   ```

## Rolling Back

If you need to roll back to BrilliantCode:

1. **Backup Cheri data**:
   ```bash
   cp -r ~/.cheri ~/.cheri-backup
   ```

2. **Restore BrilliantCode**:
   ```bash
   mv ~/.cheri ~/.brilliantcode
   ```

3. **Reinstall BrilliantCode** from the original source

## Getting Help

If you encounter issues during migration:

- 📧 **Email**: support@heysalad.co
- 🐛 **Issues**: [github.com/Hey-Salad/cheri/issues](https://github.com/Hey-Salad/cheri/issues)
- 💬 **Discord**: [discord.gg/heysalad](https://discord.gg/heysalad)

## What's Next?

After migrating, check out the new features:

- ⚡ **Faster startup** - Notice the speed improvements
- 🎨 **Plain black UI** - Easy on the eyes for long coding sessions
- 💾 **Better memory management** - More stable for long sessions
- 🚀 **Optimized IPC** - Smoother terminal and UI interactions

Welcome to **Cheri by HeySalad** - AI that remembers your code! 🖤
