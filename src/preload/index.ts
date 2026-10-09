import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ScreenAudioStartResult, ScreenSource } from "../shared/screen";
import type { UpdateState } from "../shared/update";

// Ponte mínima com o processo principal. Push-to-talk global vai entrar aqui.
contextBridge.exposeInMainWorld("toca", {
  platform: process.platform,
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke("update:state"),
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const listener = (_e: IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on("update:state", listener);
    return () => {
      ipcRenderer.removeListener("update:state", listener);
    };
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close"),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:is-maximized"),
  onWindowMaximized: (callback: (maximized: boolean) => void) => {
    const listener = (_e: IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximized", listener);
    return () => {
      ipcRenderer.removeListener("window:maximized", listener);
    };
  },
  loadSession: (): Promise<string | null> => ipcRenderer.invoke("session:load"),
  saveSession: (refreshToken: string | null): Promise<void> => ipcRenderer.invoke("session:save", refreshToken),
  getScreenSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke("screen:sources"),
  selectScreenSource: (sourceId: string): Promise<void> => ipcRenderer.invoke("screen:select", sourceId),
  startScreenAudio: (): Promise<ScreenAudioStartResult> => ipcRenderer.invoke("screen:audio-start"),
  stopScreenAudio: (): Promise<void> => ipcRenderer.invoke("screen:audio-stop"),
  onScreenAudioData: (callback: (chunk: Uint8Array) => void) => {
    const listener = (_e: IpcRendererEvent, chunk: Uint8Array) => callback(chunk);
    ipcRenderer.on("screen:audio-data", listener);
    return () => {
      ipcRenderer.removeListener("screen:audio-data", listener);
    };
  },
});
