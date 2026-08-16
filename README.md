# anything-to-blocks

> Browse any website, select DOM regions, and convert them into WordPress
> Gutenberg blocks with an AI agent connected to WordPress via MCP.

![Architecture](docs/architecture.png)

**anything-to-blocks** is an Electron desktop app that bridges web browsing and
WordPress block editing. Load any URL, pick an element from the page, and an
ACP agent generates the corresponding Gutenberg block markup — using core
blocks, patterns, or custom blocks registered on your WordPress site.

## Features

- 🌐 **Browser panel** — load any website in an embedded browser (Electron
  WebContentsView, no CORS limitations)
- 🎯 **Element picker** — hover to highlight, click to select any DOM region
- 🧵 **Mini conversations** — each selected region gets its own conversation
  thread with the AI agent
- 📦 **Block generation** — converts visual + structural data into Gutenberg
  block markup
- 🔌 **WordPress MCP** — connects to your WordPress site via the [MCP
  Adapter](https://github.com/WordPress/mcp-adapter) so the agent knows what
  blocks, patterns, and templates are available
- 🎨 **WordPress sidebar** — view active theme, installed plugins, registered
  blocks, patterns, and templates

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 22
- An [ACP-compatible agent](https://github.com/AcpProtocol/acp-spec) installed
  (e.g. [opencode](https://github.com/sst/opencode) or
  [Goose](https://github.com/block/goose))
- A WordPress site (6.9+) with the [MCP Adapter](https://github.com/WordPress/mcp-adapter)
  plugin installed (optional but recommended)

### Install & Run

```bash
git clone https://github.com/guzma/anything-to-blocks.git
cd anything-to-blocks
npm install
npm run build
npm start
```

### Configuration

On first launch, click the **Settings** button (gear icon) to configure:

#### Agent Settings

| Field | Description | Default |
|-------|-------------|---------|
| Command | Agent process command | `opencode` |
| Args | Agent arguments | `["acp"]` |
| Environment | Additional env vars | `{}` |
| Block Prompt | System prompt for block generation | Built-in expert prompt |

#### WordPress Connection

| Field | Description |
|-------|-------------|
| Site URL | Your WordPress site URL (e.g. `https://example.com`) |
| Username | WordPress username |
| Application Password | WordPress Application Password (see below) |
| MCP Endpoint | MCP server endpoint URL (see below) |
| MCP Transport | `http` (remote) or `stdio` (local) |

### WordPress Setup

#### Application Passwords

1. Log in to your WordPress admin
2. Go to **Users → Profile → Application Passwords**
3. Create a new application password (name it "anything-to-blocks")
4. Copy the generated password into the app's Settings

#### MCP Adapter Plugin

1. Install the [MCP Adapter](https://github.com/WordPress/mcp-adapter) plugin
2. Install the [Anything to Blocks Companion](companion-plugin/) plugin
   (registers block/pattern/template abilities)
3. The MCP endpoint URL will be:
   `https://yoursite.com/wp-json/mcp/mcp-adapter-default-server`

#### HTTP Transport (Remote Sites)

For remote WordPress sites, use the
[`@automattic/mcp-wordpress-remote`](https://www.npmjs.com/package/@automattic/mcp-wordpress-remote)
proxy. Set MCP Transport to `http` and use the MCP endpoint URL above.

#### STDIO Transport (Local Sites)

For local WordPress sites with WP-CLI, set MCP Transport to `stdio` and use:

```
wp --path=/path/to/wordpress mcp-adapter serve --server=mcp-adapter-default-server --user=admin
```

## Usage

1. **Load a website** — enter a URL in the address bar and press Enter
2. **Toggle the element picker** — click the picker button (cursor icon)
3. **Select an element** — hover to highlight, click to select
4. **Start a conversation** — a mini conversation card appears in the right
   panel for each selected region
5. **Generate blocks** — click "Convert to block" or type a custom request
6. **Copy the result** — the generated Gutenberg block markup appears in the
   card's block output section with a copy button

## How It Works

```
User selects element
    ↓
App captures:
  - Screenshot of the element region
  - DOM structure (tag, classes, attributes, computed styles, outer HTML)
  - WordPress site info (available blocks, patterns, templates)
    ↓
ACP agent receives context as content blocks
  (image + text + WordPress info via MCP)
    ↓
Agent generates Gutenberg block markup
    ↓
User iterates: "make it a pattern", "use columns", etc.
    ↓
User copies final block markup to clipboard
```

## Development

```bash
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint
npm run build        # Full build (tsc + preload CJS shim)
npm run dev          # Watch mode
npm run ci           # typecheck + lint + build
```

See [AGENTS.md](AGENTS.md) for architecture details and coding guidelines.

## Companion Plugin

The `companion-plugin/` directory contains a WordPress plugin that registers
MCP abilities for block, pattern, and template introspection. Install it
alongside the MCP Adapter plugin on your WordPress site so the AI agent can
query what blocks and patterns are available.

See [companion-plugin/readme.txt](companion-plugin/readme.txt) for details.

## Roadmap

### V1 (Current)
- ✅ Browser panel with element picker
- ✅ Per-region mini conversations
- ✅ Block markup generation via ACP agent
- ✅ WordPress site info via REST API
- ✅ WordPress MCP integration via companion plugin

### V2 (Future)
- 📋 Full theme generation from a URL — scrape multiple pages, analyze design
  system, generate `theme.json`, templates, template parts, and patterns
- 📦 Package as downloadable block theme zip
- 🔄 Block markup validation and live preview
- 🏷️ Pattern library — save generated blocks as reusable patterns

## License

MIT