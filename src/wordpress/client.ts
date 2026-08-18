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

  private cookieJar: string | null = null;

  private async fetchJson<T>(endpoint: string): Promise<T | null> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const headers: Record<string, string> = { ...this.authHeaders };
      if (this.cookieJar) {
        headers["Cookie"] = this.cookieJar;
      }

      // Use manual redirect to capture cookies from auto-login redirects
      // (WordPress Playground redirects /wp-json/* in a loop unless cookies are persisted)
      let res = await fetch(url, { headers, redirect: "manual" });

      // Handle 302 redirect: capture cookies and retry with them
      if (res.status >= 300 && res.status < 400) {
        const setCookies = res.headers.getSetCookie?.() ?? [];
        if (setCookies.length > 0) {
          this.cookieJar = setCookies.map((c) => c.split(";")[0]).join("; ");
          headers["Cookie"] = this.cookieJar;
        }
        res = await fetch(url, { headers, redirect: "manual" });
      }

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

    const [root, themes, plugins, blockTypes, blockPatterns, templates, templateParts] = await Promise.all([
      this.fetchJson<{ name: string; description: string }>("/"),
      this.fetchJson<WordPressTheme[]>("/wp/v2/themes"),
      this.fetchJson<WordPressPlugin[]>("/wp/v2/plugins"),
      this.fetchJson<WordPressBlockType[]>("/wp/v2/block-types?context=edit"),
      this.fetchJson<WordPressBlockPattern[]>("/wp/v2/block-patterns"),
      this.fetchJson<WordPressTemplate[]>("/wp/v2/templates"),
      this.fetchJson<WordPressTemplatePart[]>("/wp/v2/template-parts")
    ]);

    const activeTheme = themes?.find((t) => t.status === "active") ?? themes?.[0] ?? null;

    const info: WordPressSiteInfo = {
      siteUrl,
      siteName: root?.name ?? "",
      siteDescription: root?.description ?? "",
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
    this.cookieJar = null;
  }

  isConnected(): boolean {
    return this.config.siteUrl.length > 0;
  }
}