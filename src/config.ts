import { z } from "zod";

export const agentConfigSchema = z.object({
  command: z.string().min(1).or(z.undefined()).default("opencode"),
  args: z.array(z.string()).or(z.undefined()).default(["acp"]),
  env: z.record(z.string(), z.string()).or(z.undefined()).default({}),
  blockPrompt: z.string().min(1).or(z.undefined()).default(() =>
    "You are an expert in WordPress Gutenberg blocks. " +
    "Given a screenshot of a web page region, its DOM structure, and information about " +
    "the WordPress site (available blocks, patterns, templates), generate the corresponding " +
    "Gutenberg block markup. Use core blocks when possible, patterns when a close match exists, " +
    "or custom blocks if the site has them registered. " +
    "Return only the block markup (HTML with block delimiters). " +
    "Do not include explanations unless asked."
  )
});

export const wordpressConfigSchema = z.object({
  siteUrl: z.string().url().or(z.literal("")).or(z.undefined()).default(""),
  username: z.string().or(z.undefined()).default(""),
  applicationPassword: z.string().or(z.undefined()).default(""),
  mcpEndpoint: z.string().or(z.undefined()).default(""),
  mcpTransport: z.enum(["http", "stdio"]).or(z.undefined()).default("http")
});

export const appConfigSchema = z.object({
  agent: agentConfigSchema.default(() => ({
    command: "opencode",
    args: ["acp"],
    env: {},
    blockPrompt:
      "You are an expert in WordPress Gutenberg blocks. " +
      "Given a screenshot of a web page region, its DOM structure, and information about " +
      "the WordPress site (available blocks, patterns, templates), generate the corresponding " +
      "Gutenberg block markup. Use core blocks when possible, patterns when a close match exists, " +
      "or custom blocks if the site has them registered. " +
      "Return only the block markup (HTML with block delimiters). " +
      "Do not include explanations unless asked."
  })),
  wordpress: wordpressConfigSchema.default(() => ({
    siteUrl: "",
    username: "",
    applicationPassword: "",
    mcpEndpoint: "",
    mcpTransport: "http" as const
  }))
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type WordPressConfig = z.infer<typeof wordpressConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;