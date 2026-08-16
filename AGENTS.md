# AGENTS.md

Guidance for AI coding agents working on the anything-to-blocks codebase.

## Project Overview

**anything-to-blocks** is an Electron desktop app that lets users browse any
website, select DOM regions via an element picker, and convert them into
WordPress Gutenberg blocks using an ACP (Agent Client Protocol) agent connected
to a WordPress instance via MCP (Model Context Protocol).

The app is modeled after [visual-research-pal](https://github.com/anthropics/visual-research-pal),
replacing the PDF viewer with a browser panel and the research report with
Gutenberg block markup generation.

## Architecture

```
Electron App
├── WordPress Sidebar (left)     — site info, theme, plugins, blocks, patterns
├── Browser Panel (center)       — WebContentsView with element picker
├── Region Conversations (right) — per-region mini conversations + block output
│
├── Express Server (in-process)
│   └── /api/session, /api/browser/*, /api/region/*, /api/wordpress/*
│
├── ACP Client
│   ├── Spawns agent process (e.g. opencode, goose)
│   ├── Creates session with WordPress MCP server configured
│   └── Sends: screenshot + DOM structure + WordPress info → block markup
│
└── WordPress REST API Client
    └── Queries theme, plugins, block-types, patterns, templates
```

### Key Design Decisions

1. **Mini conversations per region** — each selected element gets its own
   threaded conversation card, not a single shared chat panel.
2. **Single global browser control** — one WebContentsView shared by all
   sessions. Sessions get `globalBrowserControl` assigned at creation.
3. **Element picker uses console-message bridge** — picker.js (injected into
   the page) communicates via `console.log("__A2B_PICKER__:" + ...)` which
   main.ts intercepts via `webContents.on('console-message')` and forwards to
   the renderer via IPC. This avoids ESM/CJS preload issues in the browser view.
4. **Config persisted in userData** — `a2b-config.json` in Electron's
   `app.getPath("userData")`, loaded/saved via `config:get`/`config:set` IPC.
5. **Preload CJS shim** — `scripts/copy-preload.mjs` converts the ESM
   `preload.js` output to `preload.cjs` for Electron's CommonJS require.

## Development

### Prerequisites

- Node.js ≥ 22
- An ACP-compatible agent installed (e.g. `opencode`, `goose`)
- A WordPress site (6.9+) with the MCP Adapter plugin for full functionality

### Commands

```bash
npm install          # Install dependencies
npm run build        # TypeScript compile + preload CJS shim
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint
npm run dev          # Watch mode (tsc --watch)
npm start            # Launch Electron app (requires build first)
npm run ci           # typecheck + lint + build
npm run dist         # Build + package as installer (electron-builder)
```

### File Structure

```
src/
├── server.ts              Express API server
├── config.ts              Zod config schemas + types
├── types.ts               Shared app types (RegionData, WordPressSiteInfo, etc.)
├── electron/
│   ├── main.ts            Electron main process, IPC, browser view
│   └── preload.ts         Context bridge (a2b API exposed to renderer)
├── acp/
│   ├── client.ts          ACP client — agent spawning, session, prompting
│   ├── agent-process.ts   Agent process lifecycle management
│   ├── context.ts         Builds ContentBlock[] from browser region data
│   └── types.ts           ACP-specific types (AcpSession, ChatRequest)
├── wordpress/
│   ├── client.ts          WordPress REST API client
│   └── mcp-config.ts      Builds McpServerHttp config for ACP session
public/
├── index.html             Three-panel layout + settings modal
├── app.js                 Frontend logic (vanilla JS, no framework)
├── style.css              Styles with CSS custom properties
└── picker.js              Element picker (injected into browser view)
companion-plugin/          WordPress plugin for MCP abilities
scripts/
└── copy-preload.mjs       ESM→CJS preload conversion
```

## Coding Guidelines

- **TypeScript strict mode** — all source files must pass `tsc --noEmit`.
- **ESM first** — the project uses `"type": "module"` and `"module": "NodeNext"`.
  Use `.js` extensions in imports.
- **No frameworks in frontend** — vanilla JS only (like VRP). Use CSS custom
  properties for theming.
- **Zod for validation** — all config and external input is validated with Zod.
- **Surgical changes** — make minimal, complete edits. Don't refactor unrelated
  code. Fix bugs directly caused by your changes.
- **Build before run** — `npm run build` produces `dist/` which Electron loads.
  The preload CJS shim runs automatically as part of the build.

## ACP Integration

The app uses `@agentclientprotocol/sdk` to communicate with an AI agent:

1. `AcpClient.start()` spawns the agent process
2. `AcpClient.createSession()` creates a session configured with the WordPress
   MCP server (`withMcpServer()`)
3. `AcpClient.prompt()` sends content blocks (screenshot image + DOM text +
   WordPress info text) and streams the response
4. `AcpClient.generateBlock()` sends the block generation prompt with region
   context

The agent must support ACP (Agent Client Protocol). Compatible agents include:
- [opencode](https://github.com/sst/opencode) (`opencode acp`)
- [Goose](https://github.com/block/goose)

## WordPress MCP Integration

The app connects to WordPress in two ways:

1. **REST API** (direct) — queries `/wp-json/wp/v2/*` for site info to display
   in the sidebar. Uses Application Passwords for auth.
2. **MCP** (via agent) — configures the ACP agent session with a WordPress MCP
   server. The agent can then call abilities like `a2b/get-block-types`,
   `a2b/get-block-patterns`, `a2b/get-block-templates` (registered by the
   companion plugin).

The companion plugin (`companion-plugin/`) registers three WordPress abilities
that the MCP Adapter exposes to the agent:
- `a2b/get-block-types` — all registered Gutenberg block types
- `a2b/get-block-patterns` — all registered block patterns
- `a2b/get-block-templates` — all block templates and template parts