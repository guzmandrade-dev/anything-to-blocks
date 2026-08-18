import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import express from "express";
import type { AppConfig, AgentConfig, WordPressConfig } from "./config.js";
import { appConfigSchema } from "./config.js";
import { AcpClient } from "./acp/client.js";
import type { AcpSession } from "./acp/types.js";
import { WordPressClient } from "./wordpress/client.js";
import type { RegionData } from "./types.js";

export interface BrowserControl {
  loadUrl(url: string): Promise<void>;
  captureElement(rect: { x: number; y: number; width: number; height: number }): Promise<string | null>;
  togglePicker(enabled: boolean): Promise<void>;
  getCurrentUrl(): string;
}

export interface Session {
  id: string;
  config: AppConfig;
  agent: AcpClient;
  wordpress: WordPressClient;
  acpSession: AcpSession;
  browserUrl: string;
  browserControl: BrowserControl | null;
}

const sessions = new Map<string, Session>();
let globalBrowserControl: BrowserControl | null = null;

function makeAgentConfig(config: AppConfig): AgentConfig {
  const rawEnv = config.agent.env;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    if (typeof value === "string") env[key] = value;
  }
  return {
    command: config.agent.command,
    args: config.agent.args,
    env,
    migrationMode: config.agent.migrationMode,
    blockPrompt: config.agent.blockPrompt
  };
}

export function createServer(preferredPort?: number) {
  const app = express();
  app.use(express.json({ limit: "200mb" }));

  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
  // Cache busting: append build timestamp to static assets
  const BUILD_TIMESTAMP = Date.now().toString();
  app.use((req, res, next) => {
    if (req.path === "/index.html" || req.path === "/") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    next();
  });
  app.use(express.static(publicDir, { maxAge: 0, etag: false, lastModified: true }));

  // ===== Session management =====

  app.post("/api/session", async (req, res) => {
    try {
      const { agent, wordpress } = req.body as {
        agent?: Partial<AgentConfig>;
        wordpress?: Partial<WordPressConfig>;
      };

      const config = appConfigSchema.parse({
        agent: agent ?? {},
        wordpress: wordpress ?? {}
      });

      const sessionId = randomUUID();
      const outputDir = path.join(os.tmpdir(), "a2b-" + sessionId);
      await fs.mkdir(outputDir, { recursive: true });

      const agentClient = new AcpClient({
        agent: makeAgentConfig(config),
        wordpress: config.wordpress
      });
      await agentClient.start();

      const wpClient = new WordPressClient(config.wordpress);

      const acpSession: AcpSession = {
        id: sessionId,
        outputDir,
        regions: new Map(),
        conversations: new Map(),
        wordpressInfo: null
      };

      await agentClient.createSession(acpSession);

      const session: Session = {
        id: sessionId,
        config,
        agent: agentClient,
        wordpress: wpClient,
        acpSession,
        browserUrl: "",
        browserControl: globalBrowserControl
      };

      sessions.set(sessionId, session);

      res.json({ sessionId, outputDir });
    } catch (err) {
      console.error("Session error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/session/:sessionId/snapshot", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const regions = Array.from(session.acpSession.regions.values()).map((r) => ({
      id: r.id,
      url: r.url,
      tagName: r.tagName,
      classes: r.classes,
      timestamp: r.timestamp
    }));

    const conversations = Array.from(session.acpSession.conversations.values()).map((c) => ({
      id: c.id,
      regionId: c.regionId,
      messages: c.messages,
      blockMarkup: c.blockMarkup
    }));

    res.json({
      browserUrl: session.browserUrl,
      regions,
      conversations
    });
  });

  // ===== Browser control =====

  app.post("/api/session/:sessionId/browser/load", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const { url } = req.body as { url: string };
    if (!url) return res.status(400).json({ error: "url is required" });

    try {
      if (session.browserControl) {
        await session.browserControl.loadUrl(url);
      }
      session.browserUrl = url;
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/session/:sessionId/browser/picker", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const { enabled } = req.body as { enabled: boolean };
    try {
      if (session.browserControl) {
        await session.browserControl.togglePicker(enabled);
      }
      res.json({ enabled });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ===== Region management =====

  app.post("/api/session/:sessionId/region", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const regionData = req.body as Omit<RegionData, "id" | "timestamp">;
    if (!regionData.tagName) return res.status(400).json({ error: "tagName is required" });

    const regionId = randomUUID();
    const region: RegionData = {
      ...regionData,
      id: regionId,
      timestamp: new Date().toISOString()
    };

    if (session.browserControl && region.boundingRect) {
      const screenshot = await session.browserControl.captureElement(region.boundingRect);
      region.screenshot = screenshot;
    }

    session.acpSession.regions.set(regionId, region);
    session.acpSession.conversations.set(regionId, {
      id: randomUUID(),
      regionId,
      messages: [],
      blockMarkup: null
    });

    res.json({ region });
  });

  app.get("/api/session/:sessionId/region/:regionId", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const region = session.acpSession.regions.get(req.params.regionId);
    if (!region) return res.status(404).json({ error: "Region not found" });

    const conversation = session.acpSession.conversations.get(req.params.regionId);
    res.json({ region, conversation });
  });

  app.delete("/api/session/:sessionId/region/:regionId", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    session.acpSession.regions.delete(req.params.regionId);
    session.acpSession.conversations.delete(req.params.regionId);
    res.json({ deleted: true });
  });

  // ===== WordPress info =====

  app.get("/api/session/:sessionId/wordpress/info", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    try {
      if (!session.wordpress.isConnected()) {
        return res.json({ connected: false, info: null });
      }

      const info = await session.wordpress.getSiteInfo();
      session.acpSession.wordpressInfo = info;
      res.json({ connected: true, info });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/session/:sessionId/wordpress/refresh", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    session.wordpress.clearCache();
    try {
      const info = await session.wordpress.getSiteInfo();
      session.acpSession.wordpressInfo = info;
      res.json({ info });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ===== Region chat (SSE) =====

  app.post("/api/session/:sessionId/region/:regionId/chat", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const { message } = req.body as { message: string };
    if (!message) return res.status(400).json({ error: "message is required" });

    const region = session.acpSession.regions.get(req.params.regionId);
    if (!region) return res.status(404).json({ error: "Region not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const conversation = session.acpSession.conversations.get(req.params.regionId);
      if (conversation) {
        conversation.messages.push({ role: "user", content: message, timestamp: new Date().toISOString() });
      }

      const result = await session.agent.prompt(session.acpSession, {
        message,
        regionId: req.params.regionId
      });

      if (conversation) {
        conversation.messages.push({ role: "assistant", content: result.text, timestamp: new Date().toISOString() });
      }

      res.write(`data: ${JSON.stringify({ type: "complete", response: result.text })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : String(err) })}\n\n`);
    } finally {
      res.end();
    }
  });

  // ===== Block generation (SSE) =====

  app.post("/api/session/:sessionId/region/:regionId/generate", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const region = session.acpSession.regions.get(req.params.regionId);
    if (!region) return res.status(404).json({ error: "Region not found" });

    const { customPrompt } = req.body as { customPrompt?: string };

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const result = await session.agent.generateBlock(session.acpSession, {
        regionId: req.params.regionId,
        customPrompt
      });

      const conversation = session.acpSession.conversations.get(req.params.regionId);
      if (conversation) {
        const userMsg = customPrompt ?? "Convert this selected region into Gutenberg block markup.";
        conversation.messages.push({ role: "user", content: userMsg, timestamp: new Date().toISOString() });
        conversation.messages.push({ role: "assistant", content: result.text, timestamp: new Date().toISOString() });
        conversation.blockMarkup = result.text;
      }

      res.write(`data: ${JSON.stringify({ type: "complete", response: result.text })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : String(err) })}\n\n`);
    } finally {
      res.end();
    }
  });

  // ===== Browser control registration =====

  app.post("/api/session/:sessionId/browser-control", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    // Browser control is registered via IPC, not HTTP. This endpoint is a no-op placeholder.
    res.json({ registered: !!session.browserControl });
  });

  return new Promise<{ app: express.Express; port: number }>((resolve, reject) => {
    const startPort = preferredPort && preferredPort > 0 ? preferredPort : 0;
    const server = app.listen(startPort, "0.0.0.0", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ app, port });
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (startPort && err.code === "EADDRINUSE") {
        const fallback = app.listen(0, "0.0.0.0", () => {
          const addr = fallback.address();
          const port = typeof addr === "object" && addr ? addr.port : 0;
          resolve({ app, port });
        });
        fallback.on("error", reject);
      } else {
        reject(err);
      }
    });
  });
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function setGlobalBrowserControl(control: BrowserControl): void {
  globalBrowserControl = control;
  for (const session of sessions.values()) {
    session.browserControl = control;
  }
}