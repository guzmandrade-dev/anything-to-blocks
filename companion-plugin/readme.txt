=== Anything to Blocks Companion ===
Contributors: h4l9k
Tags: mcp, gutenberg, blocks, ai, agent
Requires at least: 6.9
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later

Registers WordPress MCP abilities for Gutenberg block, pattern, and template introspection.

== Description ==

This companion plugin works with the [Anything to Blocks](https://github.com/guzma/anything-to-blocks)
desktop application. It registers WordPress MCP abilities that allow an AI agent to query:

* **Registered block types** — all Gutenberg blocks with their attributes and supports flags
* **Block patterns** — all registered patterns with their content markup
* **Block templates** — all templates and template parts with their content markup

These abilities are exposed via the [WordPress MCP Adapter](https://github.com/WordPress/mcp-adapter)
plugin, which must be installed and activated for this companion plugin to function.

== Installation ==

1. Install and activate the [WordPress MCP Adapter](https://github.com/WordPress/mcp-adapter) plugin
2. Install and activate this companion plugin
3. Set up Application Passwords for REST API authentication (Users → Profile → Application Passwords)
4. Configure the Anything to Blocks desktop app with your WordPress site URL and credentials

== Frequently Asked Questions ==

= Do I need the MCP Adapter plugin? =

Yes. This plugin only registers WordPress abilities. The MCP Adapter converts those abilities into
MCP tools that an AI agent can call.

= Can I use this without the Anything to Blocks desktop app? =

Yes. The abilities registered by this plugin are available to any MCP client that connects to your
WordPress site via the MCP Adapter, including Claude Desktop, VS Code, and other MCP-compatible tools.

== Changelog ==

= 0.1.0 =
* Initial release
* Block introspection ability (a2b/get-block-types)
* Pattern introspection ability (a2b/get-block-patterns)
* Template introspection ability (a2b/get-block-templates)
