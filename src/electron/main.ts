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
let browserView: WebContentsView | null = null;
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
  if (!url.match(/^https?:\/\//)) {
    url = `https://${url}`;
  }
  await browserView.webContents.loadURL(url);
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

  // The frontend sends the exact bounds for the browser view (computed from panel layout)
  ipcMain.handle("browser:setBounds", async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!mainWindow || !browserView) return;
    browserView.setBounds(bounds);
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
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  browserView = createBrowserView();
  mainWindow.contentView.addChildView(browserView);

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