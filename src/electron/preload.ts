import { contextBridge, ipcRenderer } from "electron";

const api = {
  loadUrl: (url: string) => ipcRenderer.invoke("browser:load", url),
  goBack: () => ipcRenderer.invoke("browser:back"),
  goForward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  togglePicker: (enabled: boolean) => ipcRenderer.invoke("browser:togglePicker", enabled),
  captureElement: (rect: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke("browser:capture", rect),
  getUrl: () => ipcRenderer.invoke("browser:getUrl"),
  setBounds: (sidebarWidth: number, headerHeight: number, toolbarHeight: number, innerWidth: number) =>
    ipcRenderer.invoke("browser:setBounds", { sidebarWidth, headerHeight, toolbarHeight, innerWidth }),
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (config: Record<string, unknown>) => ipcRenderer.invoke("config:set", config),
  onNavigated: (callback: (url: string) => void) => {
    const handler = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on("browser:navigated", handler);
    return () => ipcRenderer.removeListener("browser:navigated", handler);
  },
  onBrowserResize: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("browser:resize", handler);
    return () => ipcRenderer.removeListener("browser:resize", handler);
  },
  onElementSelected: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on("picker:elementSelected", handler);
    return () => ipcRenderer.removeListener("picker:elementSelected", handler);
  },
  onPickerEnabled: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("picker:enabled", handler);
    return () => ipcRenderer.removeListener("picker:enabled", handler);
  },
  onPickerDisabled: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("picker:disabled", handler);
    return () => ipcRenderer.removeListener("picker:disabled", handler);
  },
  onOpenSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("menu:openSettings", handler);
    return () => ipcRenderer.removeListener("menu:openSettings", handler);
  },
};

contextBridge.exposeInMainWorld("a2b", api);

export type A2bApi = typeof api;