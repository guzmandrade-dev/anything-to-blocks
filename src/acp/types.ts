import type { RegionData } from "../types.js";
import type { WordPressSiteInfo } from "../types.js";

export interface AcpSession {
  id: string;
  outputDir: string;
  regions: Map<string, RegionData>;
  conversations: Map<string, RegionConversation>;
  wordpressInfo: WordPressSiteInfo | null;
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

export interface ChatRequest {
  message: string;
  regionId: string;
}

export interface GenerateBlockRequest {
  regionId: string;
  customPrompt?: string;
}