import { z } from "zod";

/**
 * Migration mode determines how the agent generates blocks:
 * - "structure": Extract layout and content structure from the source, but let
 *   the target WordPress theme dictate the visual design. The agent should use
 *   semantic blocks (columns, groups, headings) and avoid hardcoding styles.
 *   This is the common migration scenario: new WordPress, refreshed look, same
 *   content structure.
 * - "visual": Replicate both structure and visual appearance from the source as
 *   closely as possible. Used for 1:1 migrations where the target must match
 *   the source design.
 */
export const migrationModeSchema = z.enum(["structure", "visual"]).default("structure");

const STRUCTURE_PROMPT =
  "You are an expert in WordPress Gutenberg blocks. " +
  "Your task is to migrate content from a source website into the target WordPress site.\n\n" +
  "IMPORTANT: You are migrating STRUCTURE and CONTENT, not visual styling. " +
  "The target WordPress has its own theme and design language. Your generated blocks " +
  "should adopt the target site's styles, not replicate the source site's appearance.\n\n" +
  "Guidelines:\n" +
  "- Use semantic blocks (columns, groups, headings, paragraphs, lists, quotes) that " +
  "inherit styles from the target theme.\n" +
  "- Match the LAYOUT structure of the source (e.g. two-column grid, hero section, " +
  "card list) but do NOT hardcode colors, fonts, spacing, or other visual properties.\n" +
  "- Do NOT add inline styles, custom CSS, or style attributes unless absolutely " +
  "necessary for structural correctness.\n" +
  "- Use core blocks when possible. If a registered pattern closely matches the " +
  "source layout, use it. If the site has custom blocks that fit, use those.\n" +
  "- Preserve the content hierarchy (heading levels, list nesting, emphasis).\n" +
  "- Given a screenshot of a web page region, its DOM structure, and information " +
  "about the WordPress site (available blocks, patterns, templates, theme), generate " +
  "the corresponding Gutenberg block markup.\n" +
  "- Return only the block markup (HTML with block delimiters). " +
  "Do not include explanations unless asked.";

const VISUAL_PROMPT =
  "You are an expert in WordPress Gutenberg blocks. " +
  "Your task is to perform a 1:1 migration: replicate both the structure AND the " +
  "visual appearance of the source website region in the target WordPress site.\n\n" +
  "Guidelines:\n" +
  "- Match the source's layout, colors, typography, spacing, and visual hierarchy " +
  "as closely as possible using Gutenberg blocks.\n" +
  "- Use inline styles or custom styles where needed to match the source appearance, " +
  "but prefer theme.json-compatible approaches (preset colors, font sizes) when the " +
  "target theme supports them.\n" +
  "- Use core blocks when possible. If a registered pattern closely matches the " +
  "source, use it. If the site has custom blocks that fit, use those.\n" +
  "- Given a screenshot of a web page region, its DOM structure, computed styles, " +
  "and information about the WordPress site, generate the corresponding Gutenberg " +
  "block markup.\n" +
  "- Return only the block markup (HTML with block delimiters). " +
  "Do not include explanations unless asked.";

export function getDefaultPrompt(mode: "structure" | "visual"): string {
  return mode === "visual" ? VISUAL_PROMPT : STRUCTURE_PROMPT;
}

export const agentConfigSchema = z.object({
  command: z.string().min(1).or(z.undefined()).default("opencode"),
  args: z.array(z.string()).or(z.undefined()).default(["acp"]),
  env: z.record(z.string(), z.string()).or(z.undefined()).default({}),
  model: z.string().or(z.undefined()).default(""),
  migrationMode: migrationModeSchema.or(z.undefined()).default("structure"),
  blockPrompt: z.string().min(1).or(z.undefined()).default(() => STRUCTURE_PROMPT)
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
    model: "",
    migrationMode: "structure" as const,
    blockPrompt: STRUCTURE_PROMPT
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
export type MigrationMode = z.infer<typeof migrationModeSchema>;