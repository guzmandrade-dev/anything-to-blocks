import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import type { Stream } from "@agentclientprotocol/sdk";
import { ndJsonStream } from "@agentclientprotocol/sdk";

export interface AgentProcess {
  process: ChildProcess;
  stream: Stream;
  kill(): void;
}

export function spawnAgentProcess(command: string, args: string[], env: Record<string, string>): AgentProcess {
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
    shell: false
  });

  if (!child.stdin || !child.stdout) {
    throw new Error(`Failed to spawn agent: ${command}`);
  }

  const writable = Writable.toWeb(child.stdin);
  const readable = Readable.toWeb(child.stdout);
  const stream = ndJsonStream(writable, readable as ReadableStream<Uint8Array>);

  child.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[agent stderr] ${chunk.toString("utf-8")}`);
  });

  child.on("error", (err) => {
    console.error("Agent process error:", err);
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`Agent process exited with code ${code}`);
    }
  });

  return {
    process: child,
    stream,
    kill() {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };
}