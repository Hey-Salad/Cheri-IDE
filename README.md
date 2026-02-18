# Cheri by HeySalad

**AI that remembers your code**

[![Cheri](assets/cheri-banner.png)](https://heysalad.co/cheri)

Cheri is an open-source AI coding assistant with memory, built by HeySalad Inc. It's a developer-friendly IDE that enables frontier AI models (including open source models) to build projects for you autonomously. Inside Cheri, an LLM can spin up terminals, control a browser, and create/edit files just like you can as a developer.

## Features

- 🧠 **AI with Memory** - Cheri remembers your code, patterns, and project context
- 🔧 **Autonomous Agent** - LLMs can control terminals, browsers, and files
- 🎨 **Plain Black UI** - VS Code-style interface, easy on the eyes for all-day coding
- 🚀 **High Performance** - Optimized startup, lazy loading, efficient IPC
- 🔒 **Local First** - Everything runs on your machine, files never leave your control
- 🌐 **Model Agnostic** - Works with OpenAI, Anthropic, Azure, and custom models
- 🔌 **MCP Support** - Model Context Protocol for extensibility

## Getting Started

### 1. Download Cheri

Visit [heysalad.co/cheri](https://heysalad.co/cheri) to download for macOS, Windows, or Linux.

### 2. Add Your API Keys

Go to **AI → API Keys** and add your provider keys:

- OpenAI API Key
- Anthropic API Key
- Azure OpenAI (optional)

![Add API Keys](assets/add-api-keys.png)

### 3. Select a Model

Choose from GPT-4, Claude, or custom models:

![Select Model](assets/select-model.png)

You can also add custom models for self-hosted LLMs.

### 4. Open a Project

Point Cheri at your project directory:

![Choose a Project](assets/choose-a-project.png)

Cheri runs in-place - select a directory you trust.

### 5. Start Coding

Tell Cheri what you want to build:

![Send a Message](assets/send-a-message.png)

## Documentation

Read the full documentation to learn how Cheri works:

[📖 Documentation (DOCS.md)](DOCS.md)

## Migration from BrilliantCode

If you're migrating from BrilliantCode, see [MIGRATION.md](MIGRATION.md) for upgrade instructions.

Your data will automatically migrate from `~/.brilliantcode` to `~/.cheri` on first launch.

## Development

### Prerequisites

- Node.js 20+
- npm or yarn

### Setup

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

### Build for Production

```bash
# macOS
npm run dist

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

## Environment Variables

Configure Cheri with these optional environment variables:

```bash
# API Keys (or set via UI)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Default model
CHERI_DEFAULT_MODEL=gpt-4

# Auto-updater
CHERI_UPDATE_FEED_URL=https://updates.heysalad.co/cheri/

# Version check
CHERI_VERSION_CHECK_URL=https://api.heysalad.co/version
```

See [.env.example](.env.example) for all options.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

## About HeySalad

Cheri is built by **HeySalad Inc.**
584 Castro St, San Francisco, CA 94114

Visit us at [heysalad.co](https://heysalad.co)

---

**Cheri by HeySalad® - AI that remembers your code** 🖤
