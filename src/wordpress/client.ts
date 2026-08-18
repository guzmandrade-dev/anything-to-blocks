import type { WordPressConfig } from "../config.js";
import type {
  WordPressSiteInfo,
  WordPressTheme,
  WordPressLocalizedString,
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

  private resolveLocalizedString(value: string | WordPressLocalizedString | undefined): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    return value.rendered ?? value.raw ?? "";
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

  private updateCookieJar(res: Response): void {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      this.cookieJar = setCookies.map((c) => c.split(";")[0]).join("; ");
    }
  }

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
        this.updateCookieJar(res);
        headers["Cookie"] = this.cookieJar ?? "";
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

  private normalizeTheme(raw: unknown): WordPressTheme | null {
    if (!raw || typeof raw !== "object") return null;
    const t = raw as Record<string, unknown>;
    const name = this.resolveLocalizedString(t.name as string | WordPressLocalizedString | undefined) ||
      this.resolveLocalizedString(t.theme_name as string | WordPressLocalizedString | undefined);
    if (!name) return null;
    return {
      stylesheet: String(t.stylesheet ?? t.slug ?? ""),
      name,
      version: String(t.version ?? ""),
      status: String(t.status ?? "active")
    };
  }

  private normalizeBlockTypes(raw: unknown): WordPressBlockType[] {
    if (!raw) return [];
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (typeof raw === "object") {
      items = Object.values(raw);
    }
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const b = item as Record<string, unknown>;
        const name = String(b.name ?? "");
        if (!name) return null;
        return {
          name,
          title: this.resolveLocalizedString(b.title as string | WordPressLocalizedString | undefined),
          category: String(b.category ?? ""),
          icon: typeof b.icon === "string" ? b.icon : "",
          description: this.resolveLocalizedString(b.description as string | WordPressLocalizedString | undefined),
          attributes: (b.attributes as WordPressBlockType["attributes"]) ?? {},
          supports: (b.supports as WordPressBlockType["supports"]) ?? {}
        };
      })
      .filter((b): b is WordPressBlockType => b !== null);
  }

  private async fetchBlockTypes(): Promise<WordPressBlockType[]> {
    // Try edit context first for full attribute/supports data; fall back to view context
    // if the edit context is unauthorized or empty.
    const edit = await this.fetchJson<WordPressBlockType[]>("/wp/v2/block-types?context=edit");
    const normalizedEdit = this.normalizeBlockTypes(edit);
    if (normalizedEdit.length > 0) {
      return normalizedEdit;
    }
    const view = await this.fetchJson<WordPressBlockType[]>("/wp/v2/block-types");
    return this.normalizeBlockTypes(view);
  }

  async getSiteInfo(): Promise<WordPressSiteInfo> {
    if (this.cache && Date.now() - this.cacheTime < this.cacheTtl) {
      return this.cache;
    }

    const siteUrl = this.config.siteUrl.replace(/\/$/, "");

    // Fetch sequentially so cookie-jar updates from WordPress login redirects are
    // applied to subsequent requests.
    const root = await this.fetchJson<{ name: string; description: string }>("/");
    const themesRaw = await this.fetchJson<unknown>("/wp/v2/themes");
    const themes = this.normalizeThemes(themesRaw);
    const plugins = (await this.fetchJson<WordPressPlugin[]>("/wp/v2/plugins")) ?? [];
    const blockTypes = await this.fetchBlockTypes();
    const blockPatterns = (await this.fetchJson<WordPressBlockPattern[]>("/wp/v2/block-patterns")) ?? [];
    const templates = (await this.fetchJson<WordPressTemplate[]>("/wp/v2/templates")) ?? [];
    const templateParts = (await this.fetchJson<WordPressTemplatePart[]>("/wp/v2/template-parts")) ?? [];

    const activeTheme = themes.find((t) => t.status === "active") ?? themes[0] ?? null;

    console.log(
      `WordPress site info: theme=${activeTheme?.name ?? "none"}, ` +
        `plugins=${plugins.length}, blockTypes=${blockTypes.length}, ` +
        `patterns=${blockPatterns.length}, templates=${templates.length}, templateParts=${templateParts.length}`
    );

    const info: WordPressSiteInfo = {
      siteUrl,
      siteName: root?.name ?? "",
      siteDescription: root?.description ?? "",
      theme: activeTheme ?? null,
      plugins,
      blockTypes,
      blockPatterns,
      templates,
      templateParts
    };

    this.cache = info;
    this.cacheTime = Date.now();
    return info;
  }

  private normalizeThemes(raw: unknown): WordPressTheme[] {
    if (!raw) return [];
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (typeof raw === "object") {
      items = Object.values(raw);
    }
    return items.map((t) => this.normalizeTheme(t)).filter((t): t is WordPressTheme => t !== null);
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