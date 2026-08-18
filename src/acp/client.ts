import { client } from "@agentclientprotocol/sdk";
import type { ClientApp, ContentBlock, ActiveSession, ClientConnection, McpServer } from "@agentclientprotocol/sdk";
import { spawnAgentProcess, type AgentProcess } from "./agent-process.js";
import { buildContextContent } from "./context.js";
import type { AcpSession, ChatRequest, GenerateBlockRequest } from "./types.js";
import type { AgentConfig, WordPressConfig } from "../config.js";
import { getDefaultPrompt } from "../config.js";

export interface AcpClientOptions {
  agent: AgentConfig;
  wordpress: WordPressConfig;
}

export interface PromptResult {
  text: string;
  stopReason: string;
}

export class AcpClient {
  private app: ClientApp;
  private process: AgentProcess | null = null;
  private connection: ClientConnection | null = null;
  private options: AcpClientOptions;
  private sessions = new Map<string, ActiveSession>();

  constructor(options: AcpClientOptions) {
    this.options = options;
    this.app = client({ name: "anything-to-blocks" });
  }

  async start(): Promise<void> {
    if (this.process) return;
    const { command, args, env, model } = this.options.agent;
    const agentEnv = { ...env };
    if (model) {
      // Pass model to agents via env var — opencode uses OPENCODE_MODEL
      agentEnv["OPENCODE_MODEL"] = model;
    }
    this.process = spawnAgentProcess(command, args, agentEnv);
    this.connection = this.app.connect(this.process.stream);

    this.connection.closed.catch((err) => {
      console.error("ACP connection closed:", err);
      this.stop();
    });
  }

  stop(): void {
    this.sessions.forEach((session) => session.dispose());
    this.sessions.clear();
    this.connection?.close();
    this.connection = null;
    this.process?.kill();
    this.process = null;
  }

  async createSession(session: AcpSession): Promise<void> {
    if (!this.connection) throw new Error("ACP agent not started");

    const builder = this.connection.agent.buildSession(session.outputDir);

    const mcpServer = this.buildMcpServer();
    if (mcpServer) {
      builder.withMcpServer(mcpServer);
    }

    const active = await builder.start();
    this.sessions.set(session.id, active);
  }

  private buildMcpServer(): McpServer | null {
    const { wordpress } = this.options;

    if (wordpress.mcpTransport === "http" && wordpress.mcpEndpoint) {
      const headers: Array<{ name: string; value: string }> = [];
      if (wordpress.username && wordpress.applicationPassword) {
        const credentials = `${wordpress.username}:${wordpress.applicationPassword}`;
        const encoded = Buffer.from(credentials).toString("base64");
        headers.push({ name: "Authorization", value: `Basic ${encoded}` });
      }
      return {
        type: "http",
        name: "wordpress-mcp",
        url: wordpress.mcpEndpoint,
        headers
      };
    }

    return null;
  }

  private getEffectivePrompt(): string {
    const { blockPrompt, migrationMode } = this.options.agent;
    // If the user has customized the prompt, use it as-is.
    // If it's still the default, use the mode-appropriate default.
    const defaultPrompt = getDefaultPrompt(migrationMode);
    if (blockPrompt && blockPrompt.trim() !== getDefaultPrompt("structure").trim() && blockPrompt.trim() !== getDefaultPrompt("visual").trim()) {
      return blockPrompt;
    }
    return defaultPrompt;
  }

  async prompt(session: AcpSession, request: ChatRequest): Promise<PromptResult> {
    const active = this.sessions.get(session.id);
    if (!active) throw new Error("Session not found");

    const region = session.regions.get(request.regionId);
    if (!region) throw new Error("Region not found");

    const conversation = session.conversations.get(request.regionId)?.messages ?? [];

    const content: ContentBlock[] = [
      {
        type: "text",
        text: request.message
      },
      ...buildContextContent({
        region,
        wordpressInfo: session.wordpressInfo,
        conversation,
        systemPrompt: this.getEffectivePrompt(),
        migrationMode: this.options.agent.migrationMode
      })
    ];

    const promptResponse = await active.prompt(content);
    const text = await this.readTextFromResponse(active);

    return { text, stopReason: promptResponse.stopReason };
  }

  async generateBlock(
    session: AcpSession,
    request: GenerateBlockRequest
  ): Promise<PromptResult> {
    const active = this.sessions.get(session.id);
    if (!active) throw new Error("Session not found");

    const region = session.regions.get(request.regionId);
    if (!region) throw new Error("Region not found");

    const conversation = session.conversations.get(request.regionId)?.messages ?? [];

    const userMessage = request.customPrompt ?? "Convert this selected region into Gutenberg block markup.";

    const content: ContentBlock[] = [
      {
        type: "text",
        text: userMessage
      },
      ...buildContextContent({
        region,
        wordpressInfo: session.wordpressInfo,
        conversation,
        systemPrompt: this.getEffectivePrompt(),
        migrationMode: this.options.agent.migrationMode
      })
    ];

    const promptResponse = await active.prompt(content);
    const text = await this.readTextFromResponse(active);

    return { text, stopReason: promptResponse.stopReason };
  }

  private async readTextFromResponse(active: ActiveSession): Promise<string> {
    let text = "";
    while (true) {
      const message = await active.nextUpdate();
      if (message.kind === "stop") {
        return text;
      }
      const update = message.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
        text += update.content.text;
      }
    }
  }
}