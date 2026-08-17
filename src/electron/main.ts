import { app, BrowserWindow, ipcMain, shell, Menu, WebContentsView } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer, setGlobalBrowserControl, type BrowserControl } from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = "a2b-config.json";

interface AppConfig {
  agent?: { command?: string; args?: string; env?: string; blockPrompt?: string };
  wordpress?: { siteUrl?: string; username?: string; applicationPassword?: string; mcpEndpoint?: string; mcpTransport?: string };
}

let configCache: AppConfig | null = null;

let mainWindow: BrowserWindow | null = null;
let browserView: (WebContentsView & { _lastBounds?: Electron.Rectangle }) | null = null;
let serverPort = 0;

async function getConfigPath(): Promise<string> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

async function loadConfig(): Promise<AppConfig> {
  if (configCache) return configCache;
  const configPath = await getConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    configCache = JSON.parse(raw) as AppConfig;
  } catch {
    configCache = {};
  }
  return configCache;
}

async function saveConfig(config: AppConfig): Promise<void> {
  configCache = config;
  const configPath = await getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function readPickerScript(): Promise<string> {
  const pickerPath = path.join(__dirname, "..", "..", "public", "picker.js");
  return fs.readFile(pickerPath, "utf-8");
}

function createBrowserView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  view.webContents.on("did-navigate", (_event, url) => {
    if (mainWindow) {
      mainWindow.webContents.send("browser:navigated", url);
    }
  });

  view.webContents.on("did-navigate-in-page", (_event, url) => {
    if (mainWindow) {
      mainWindow.webContents.send("browser:navigated", url);
    }
  });

  view.webContents.on("console-message", (_event, _level, message) => {
    if (message.startsWith("__A2B_PICKER__:")) {
      const jsonStr = message.slice("__A2B_PICKER__:".length);
      try {
        const data = JSON.parse(jsonStr);
        if (mainWindow) {
          mainWindow.webContents.send("picker:elementSelected", data);
        }
      } catch (err) {
        console.error("Failed to parse picker data:", err);
      }
    }
  });

  // Keep the embedded browser at 100% zoom so the rendered page size matches
  // the view bounds exactly and doesn't overflow due to system text scaling.
  view.setBackgroundColor("#f6f7f9");

  return view;
}

async function injectPicker(enabled: boolean): Promise<void> {
  if (!browserView) return;

  if (enabled) {
    const script = await readPickerScript();
    await browserView.webContents.executeJavaScript(script);
    if (mainWindow) {
      mainWindow.webContents.send("picker:enabled");
    }
  } else {
    await browserView.webContents.executeJavaScript(
      `window.__a2bPicker && window.__a2bPicker.disable();`
    ).catch(() => {});
    if (mainWindow) {
      mainWindow.webContents.send("picker:disabled");
    }
  }
}

async function loadUrl(url: string): Promise<void> {
  if (!browserView) return;
  // Allow data: and file: URLs for testing; otherwise default to https://
  if (!url.match(/^(https?|file):\/\//) && !url.startsWith("data:")) {
    url = `https://${url}`;
  }
  await browserView.webContents.loadURL(url);
  // Inject a CSS reset that removes default margins and hides the scrollbar
  // so the page content fills the view exactly and the picker's right border
  // is not clipped by the scrollbar width.
  await browserView.webContents.insertCSS(`
    html, body { margin: 0 !important; padding: 0 !important; }
    ::-webkit-scrollbar { width: 0 !important; display: none !important; }
    html { overflow-y: scroll !important; }
  `).catch(() => {});
  if (mainWindow) {
    mainWindow.webContents.send("browser:navigated", browserView.webContents.getURL());
  }
}

function getCurrentUrl(): string {
  return browserView?.webContents.getURL() ?? "";
}

async function captureElement(rect: { x: number; y: number; width: number; height: number }): Promise<string | null> {
  if (!browserView) return null;
  try {
    const image = await browserView.webContents.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
    return image.toDataURL();
  } catch (err) {
    console.error("Capture failed:", err);
    return null;
  }
}

async function bootstrap() {
  const { port } = await createServer();
  serverPort = port;
  console.log(`Server running on port ${port}`);

  ipcMain.handle("browser:load", async (_event, url: string) => {
    await loadUrl(url);
    return { url: getCurrentUrl() };
  });

  ipcMain.handle("browser:back", async () => {
    if (browserView) {
      await browserView.webContents.navigationHistory.goBack();
    }
  });

  ipcMain.handle("browser:forward", async () => {
    if (browserView) {
      await browserView.webContents.navigationHistory.goForward();
    }
  });

  ipcMain.handle("browser:reload", async () => {
    if (browserView) {
      browserView.webContents.reload();
    }
  });

  ipcMain.handle("browser:togglePicker", async (_event, enabled: boolean) => {
    await injectPicker(enabled);
    return { enabled };
  });

  ipcMain.handle("browser:capture", async (_event, rect: { x: number; y: number; width: number; height: number }) => {
    return captureElement(rect);
  });

  ipcMain.handle("browser:getUrl", async () => getCurrentUrl());

  ipcMain.handle("config:get", async () => loadConfig());
  ipcMain.handle("config:set", async (_event, config: AppConfig) => saveConfig(config));

  // The frontend sends the sidebar width, header height, toolbar height, and
  // the renderer's innerWidth — all in the renderer's CSS-pixel space. We
  // compute a single scale ratio from contentView.width / innerWidth and apply
  // it uniformly to convert all measurements to DIP. This works across
  // Windows (where innerWidth differs from DIP at high DPI), macOS (where
  // innerWidth == DIP, ratio = 1), and Linux.
  const INSET = 2;
  ipcMain.handle("browser:setBounds", async (_event, payload: { sidebarWidth: number; headerHeight: number; toolbarHeight: number; innerWidth: number }) => {
    if (!mainWindow || !browserView) return;
    const contentBounds = mainWindow.contentView.getBounds();
    const scale = payload.innerWidth > 0 ? contentBounds.width / payload.innerWidth : 1;
    const sidebarW = Math.round(payload.sidebarWidth * scale);
    const headerH = Math.round(payload.headerHeight * scale);
    const toolbarH = Math.round(payload.toolbarHeight * scale);
    const topOffset = headerH + toolbarH;
    const x = sidebarW + INSET;
    const y = topOffset + INSET;
    const width = contentBounds.width - sidebarW - INSET * 2;
    const height = contentBounds.height - topOffset - INSET * 2;
    if (width <= 0 || height <= 0) {
      browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    browserView.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  });

  ipcMain.handle("browser:setVisible", async (_event, visible: boolean) => {
    if (!browserView) return;
    if (visible) {
      // Restore bounds from last known sidebar width
      browserView.setBounds(browserView._lastBounds ?? { x: 0, y: 0, width: 0, height: 0 });
    } else {
      // Save current bounds and hide
      browserView._lastBounds = browserView.getBounds();
      browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  });

  // Register browser control for the server to use (screenshot capture, picker, etc.)
  const control: BrowserControl = {
    loadUrl,
    captureElement,
    togglePicker: injectPicker,
    getCurrentUrl
  };
  setGlobalBrowserControl(control);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Settings…",
          accelerator: process.platform === "darwin" ? "Cmd+," : "Ctrl+Shift+,",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu:openSettings");
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "F5",
          click: (_item, focusedWindow) => {
            if (focusedWindow instanceof BrowserWindow) {
              focusedWindow.webContents.reload();
            }
          },
        },
        {
          label: "Toggle Developer Tools",
          accelerator: process.platform === "darwin" ? "Alt+Cmd+I" : "Ctrl+Shift+I",
          click: (_item, focusedWindow) => {
            if (focusedWindow instanceof BrowserWindow) {
              focusedWindow.webContents.toggleDevTools();
            }
          },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: () => {
            shell.openExternal("https://github.com/guzmandrade-dev/anything-to-blocks");
          },
        },
      ],
    },
  ]));

  app.whenReady().then(() => {
    createMainWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
      createMainWindow();
    }
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: "Anything to Blocks",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.session.clearCache();
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  browserView = createBrowserView();
  browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  // Insert the browser view at index 0 so it sits BEHIND the main renderer's
  // WebContentsView. This way the sidebar, toolbar, and DevTools (which live
  // in the main renderer) draw on top of the browser view. We must NOT remove
  // and re-add the main renderer's view, as that breaks its auto-resize
  // binding to the content area.
  mainWindow.contentView.addChildView(browserView, 0);

  // Load a dummy home page so the browser view has content and its
  // webContents dimensions are established before the user navigates.
  const homePageUrl = `http://localhost:${serverPort}/home.html`;
  browserView.webContents.loadURL(homePageUrl).then(() => {
    browserView?.webContents.insertCSS(`
      html, body { margin: 0 !important; padding: 0 !important; }
      ::-webkit-scrollbar { width: 0 !important; display: none !important; }
    `).catch(() => {});
  }).catch(() => {
    browserView?.webContents.loadURL("about:blank").catch(() => {});
  });

  mainWindow.on("resize", () => {
    if (mainWindow) {
      mainWindow.webContents.send("browser:resize");
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    browserView = null;
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

bootstrap().catch((err) => {
  console.error("Failed to start:", err);
  app.quit();
});