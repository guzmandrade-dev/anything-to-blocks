import type { WordPressConfig } from "../config.js";
import type { McpServer } from "@agentclientprotocol/sdk";

export function buildWordpressMcpServer(config: WordPressConfig): McpServer | null {
  if (!config.siteUrl) return null;

  if (config.mcpTransport === "http") {
    const endpoint = config.mcpEndpoint || buildDefaultMcpEndpoint(config.siteUrl);
    const headers: Array<{ name: string; value: string }> = [];

    if (config.username && config.applicationPassword) {
      const credentials = `${config.username}:${config.applicationPassword}`;
      const encoded = Buffer.from(credentials).toString("base64");
      headers.push({ name: "Authorization", value: `Basic ${encoded}` });
    }

    return {
      type: "http",
      name: "wordpress-mcp",
      url: endpoint,
      headers
    };
  }

  return null;
}

function buildDefaultMcpEndpoint(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/wp-json/mcp/mcp-adapter-default-server`;
}