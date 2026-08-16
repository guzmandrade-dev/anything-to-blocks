import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { RegionData } from "../types.js";
import type { WordPressSiteInfo } from "../types.js";
import type { ConversationMessage } from "./types.js";

export interface BuildContextOptions {
  region: RegionData;
  wordpressInfo: WordPressSiteInfo | null;
  conversation: ConversationMessage[];
  systemPrompt: string;
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
  const { region, wordpressInfo, conversation, systemPrompt } = options;
  const parts: string[] = [];

  parts.push(systemPrompt);
  parts.push(`Source URL: ${region.url}`);
  parts.push(`Selected element: <${region.tagName}>`);
  parts.push(`Classes: ${region.classes.join(" ") || "(none)"}`);
  if (region.idAttribute) {
    parts.push(`ID: ${region.idAttribute}`);
  }

  parts.push(`Bounding rect: ${JSON.stringify(region.boundingRect)}`);

  const relevantStyles = Object.entries(region.computedStyles)
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  parts.push(`Computed styles:\n${relevantStyles}`);

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