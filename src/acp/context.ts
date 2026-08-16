import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { RegionData } from "../types.js";
import type { WordPressSiteInfo } from "../types.js";
import type { ConversationMessage } from "./types.js";
import type { MigrationMode } from "../config.js";

export interface BuildContextOptions {
  region: RegionData;
  wordpressInfo: WordPressSiteInfo | null;
  conversation: ConversationMessage[];
  systemPrompt: string;
  migrationMode: MigrationMode;
}

export function buildContextContent(options: BuildContextOptions): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  blocks.push({
    type: "text",
    text: buildContextText(options)
  });

  if (options.region.screenshot) {
    blocks.push({
      type: "image",
      data: stripDataUrlPrefix(options.region.screenshot),
      mimeType: "image/jpeg"
    });
  }

  return blocks;
}

function buildContextText(options: BuildContextOptions): string {
  const { region, wordpressInfo, conversation, systemPrompt, migrationMode } = options;
  const parts: string[] = [];

  parts.push(systemPrompt);

  if (migrationMode === "structure") {
    parts.push(
      "MIGRATION MODE: Structure-only. Extract layout and content hierarchy from the source. " +
      "Do NOT replicate source styles — the target WordPress theme provides the design. " +
      "Use semantic blocks that inherit theme styles."
    );
  } else {
    parts.push(
      "MIGRATION MODE: Visual 1:1. Replicate both structure and visual appearance. " +
      "Match source colors, typography, and spacing as closely as possible."
    );
  }

  parts.push(`Source URL: ${region.url}`);
  parts.push(`Selected element: <${region.tagName}>`);
  parts.push(`Classes: ${region.classes.join(" ") || "(none)"}`);
  if (region.idAttribute) {
    parts.push(`ID: ${region.idAttribute}`);
  }

  parts.push(`Bounding rect: ${JSON.stringify(region.boundingRect)}`);

  if (migrationMode === "visual") {
    // Include computed styles only in visual mode — in structure mode they
    // encourage the agent to replicate source styling, which we want to avoid.
    const relevantStyles = Object.entries(region.computedStyles)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    parts.push(`Computed styles:\n${relevantStyles}`);
  } else {
    // In structure mode, include only layout-relevant styles
    const layoutKeys = ["display", "flex-direction", "grid-template-columns", "flex-wrap", "position"];
    const layoutStyles = Object.entries(region.computedStyles)
      .filter(([k, v]) => v && layoutKeys.includes(k))
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    if (layoutStyles) {
      parts.push(`Layout styles (structural only):\n${layoutStyles}`);
    }
  }

  const truncatedHtml = region.outerHTML.length > 2000
    ? region.outerHTML.slice(0, 2000) + "\n... (truncated)"
    : region.outerHTML;
  parts.push(`Outer HTML:\n${truncatedHtml}`);

  if (region.innerText) {
    const truncatedText = region.innerText.length > 1000
      ? region.innerText.slice(0, 1000) + "\n... (truncated)"
      : region.innerText;
    parts.push(`Inner text:\n${truncatedText}`);
  }

  if (wordpressInfo) {
    parts.push(buildWordPressInfoText(wordpressInfo));
  } else {
    parts.push("WordPress site info: (not connected)");
  }

  if (conversation.length > 0) {
    const history = conversation
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    parts.push(`Conversation history:\n${history}`);
  }

  return parts.join("\n\n");
}

function buildWordPressInfoText(info: WordPressSiteInfo): string {
  const parts: string[] = ["WordPress site info:"];

  if (info.theme) {
    parts.push(`Active theme: ${info.theme.name} (v${info.theme.version}, stylesheet: ${info.theme.stylesheet})`);
  }

  if (info.plugins.length > 0) {
    const plugins = info.plugins
      .filter((p) => p.status === "active")
      .map((p) => `  - ${p.name} (v${p.version})`)
      .join("\n");
    parts.push(`Active plugins:\n${plugins}`);
  }

  if (info.blockTypes.length > 0) {
    const blocks = info.blockTypes
      .map((b) => `  - ${b.name}: ${b.title} (${b.category})`)
      .join("\n");
    parts.push(`Registered block types:\n${blocks}`);
  }

  if (info.blockPatterns.length > 0) {
    const patterns = info.blockPatterns
      .map((p) => `  - ${p.name}: ${p.title}`)
      .join("\n");
    parts.push(`Block patterns:\n${patterns}`);
  }

  return parts.join("\n");
}

function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl;
  return dataUrl.slice(comma + 1);
}