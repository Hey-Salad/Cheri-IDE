# BrilliantCode (Open Source)

BrilliantCode is an Electron IDE with an integrated “agentic” coding assistant.

## API keys

BrilliantCode uses your provider keys (no proxy):
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Set keys either:
- In-app: `AI` → `API Keys…` (stored in your OS keychain), or
- Via environment variables (useful for local dev).

Optional web search (`google_search` tool):
- `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID` (Google Custom Search Engine)

Optional:
- `BRILLIANTCODE_DEFAULT_MODEL` (defaults to built-in model picker / session model)

## Running locally (dev)

Prereqs:
- Node.js 20+ recommended

Install:
- `npm install`

Run:
- `npm run dev`

This starts:
- Vite renderer dev server on `http://localhost:5174`
- TypeScript watchers for `src/main` and `src/preload`
- Electron pointed at the dev server via `VITE_DEV_SERVER_URL`

## Tests

- `npm test`

## Production build

- `npm run build`

Outputs:
- Main: `dist/main/main.js`
- Preload: `dist/preload/preload.cjs`
- Renderer: `dist/renderer/*`

## Packaging (Electron Forge)

- `npm run build`
- `npx electron-forge make`

## Troubleshooting

- If `keytar` fails to install, ensure you have native build tooling for Node modules (Xcode CLT on macOS, Windows Build Tools on Windows, etc.).
- If the app reports a missing provider key, open `AI` → `API Keys…` and set the key(s).
