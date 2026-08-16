import type { WordPressConfig } from "../config.js";
import type {
  WordPressSiteInfo,
  WordPressTheme,
  WordPressPlugin,
  WordPressBlockType,
  WordPressBlockPattern,
  WordPressTemplate,
  WordPressTemplatePart
} from "../types.js";

export class WordPressClient {
  private config: WordPressConfig;
  private cache: WordPressSiteInfo | null = null;
  private cacheTime = 0;
  private readonly cacheTtl = 5 * 60 * 1000;

  constructor(config: WordPressConfig) {
    this.config = config;
  }

  private get authHeaders(): Record<string, string> {
    if (this.config.username && this.config.applicationPassword) {
      const credentials = `${this.config.username}:${this.config.applicationPassword}`;
      const encoded = Buffer.from(credentials).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    return {};
  }

  private get baseUrl(): string {
    const url = this.config.siteUrl.replace(/\/$/, "");
    return `${url}/wp-json`;
  }

  private async fetchJson<T>(endpoint: string): Promise<T | null> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const res = await fetch(url, { headers: this.authHeaders });
      if (!res.ok) {
        console.warn(`WordPress API ${endpoint} returned ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`WordPress API ${endpoint} failed:`, err);
      return null;
    }
  }

  async getSiteInfo(): Promise<WordPressSiteInfo> {
    if (this.cache && Date.now() - this.cacheTime < this.cacheTtl) {
      return this.cache;
    }

    const siteUrl = this.config.siteUrl.replace(/\/$/, "");

    const [themes, plugins, blockTypes, blockPatterns, templates, templateParts] = await Promise.all([
      this.fetchJson<WordPressTheme[]>("/wp/v2/themes"),
      this.fetchJson<WordPressPlugin[]>("/wp/v2/plugins"),
      this.fetchJson<WordPressBlockType[]>("/wp/v2/block-types"),
      this.fetchJson<WordPressBlockPattern[]>("/wp/v2/block-patterns"),
      this.fetchJson<WordPressTemplate[]>("/wp/v2/templates"),
      this.fetchJson<WordPressTemplatePart[]>("/wp/v2/template-parts")
    ]);

    const activeTheme = themes?.find((t) => t.status === "active") ?? themes?.[0] ?? null;

    const info: WordPressSiteInfo = {
      siteUrl,
      theme: activeTheme ?? null,
      plugins: plugins ?? [],
      blockTypes: blockTypes ?? [],
      blockPatterns: blockPatterns ?? [],
      templates: templates ?? [],
      templateParts: templateParts ?? []
    };

    this.cache = info;
    this.cacheTime = Date.now();
    return info;
  }

  clearCache(): void {
    this.cache = null;
    this.cacheTime = 0;
  }

  isConnected(): boolean {
    return this.config.siteUrl.length > 0;
  }
}