/** Shared app-wide types. */

export interface RegionData {
  id: string;
  url: string;
  tagName: string;
  classes: string[];
  idAttribute: string | null;
  attributes: Record<string, string>;
  computedStyles: Record<string, string>;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  outerHTML: string;
  innerText: string;
  screenshot: string | null;
  timestamp: string;
}

export interface RegionConversation {
  id: string;
  regionId: string;
  messages: ConversationMessage[];
  blockMarkup: string | null;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface WordPressSiteInfo {
  siteUrl: string;
  siteName: string;
  siteDescription: string;
  theme: WordPressTheme | null;
  plugins: WordPressPlugin[];
  blockTypes: WordPressBlockType[];
  blockPatterns: WordPressBlockPattern[];
  templates: WordPressTemplate[];
  templateParts: WordPressTemplatePart[];
}

export interface WordPressTheme {
  stylesheet: string;
  name: string;
  version: string;
  status: string;
}

export interface WordPressPlugin {
  plugin: string;
  name: string;
  version: string;
  status: string;
}

export interface WordPressBlockAttribute {
  type: "string" | "number" | "boolean" | "array" | "object" | unknown;
  default?: unknown;
  enum?: unknown[];
}

export interface WordPressBlockType {
  name: string;
  title: string;
  category: string;
  icon: string;
  description: string;
  attributes: Record<string, WordPressBlockAttribute>;
  supports: Record<string, unknown>;
}

export interface WordPressBlockPattern {
  name: string;
  title: string;
  content: string;
  categories: string[];
}

export interface WordPressTemplate {
  id: string;
  slug: string;
  theme: string;
  type: string;
  content: string;
}

export interface WordPressTemplatePart {
  id: string;
  slug: string;
  theme: string;
  type: string;
  area: string;
  content: string;
}