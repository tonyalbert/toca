import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ScreenAudioStartResult, ScreenSource } from "../shared/screen";
import type { UpdateState } from "../shared/update";
import type { PushToTalkBinding, ShortcutAction, ShortcutBinding } from "../shared/pushToTalk";

// Ponte com o processo principal: só para o endereço do app (ver main/shell.ts).
// Outra página na janela (não deveria acontecer: a navegação é bloqueada) não ganha nada.
const appOrigin = process.argv.find((a) => a.startsWith("--toca-app-origin="))?.split("=")[1];
const isApp = !!appOrigin && location.origin === appOrigin;

if (isApp) contextBridge.exposeInMainWorld("toca", {
  platform: process.platform,
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke("update:state"),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke("update:check"),
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const listener = (_e: IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on("update:state", listener);
    return () => {
      ipcRenderer.removeListener("update:state", listener);
    };
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  isWindowVisible: (): Promise<boolean> => ipcRenderer.invoke("window:is-visible"),
  getIdleSeconds: (): Promise<number> => ipcRenderer.invoke("system:idle-seconds"),
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
  setPushToTalk: (binding: PushToTalkBinding | null): Promise<void> => ipcRenderer.invoke("ptt:set", binding),
  recordPushToTalk: (): Promise<{ binding: PushToTalkBinding; label: string } | null> => ipcRenderer.invoke("ptt:record"),
  cancelRecordPushToTalk: (): Promise<void> => ipcRenderer.invoke("ptt:cancel-record"),
  setShortcuts: (list: [ShortcutAction, ShortcutBinding][]): Promise<void> => ipcRenderer.invoke("shortcuts:set", list),
  recordShortcut: (): Promise<{ binding: ShortcutBinding; label: string } | null> => ipcRenderer.invoke("shortcut:record"),
  cancelRecordShortcut: (): Promise<void> => ipcRenderer.invoke("shortcut:cancel-record"),
  onShortcut: (callback: (action: ShortcutAction) => void) => {
    const listener = (_e: IpcRendererEvent, action: ShortcutAction) => callback(action);
    ipcRenderer.on("shortcut:fire", listener);
    return () => {
      ipcRenderer.removeListener("shortcut:fire", listener);
    };
  },
  onPushToTalk: (callback: (pressed: boolean) => void) => {
    const listener = (_e: IpcRendererEvent, pressed: boolean) => callback(pressed);
    ipcRenderer.on("ptt:state", listener);
    return () => {
      ipcRenderer.removeListener("ptt:state", listener);
    };
  },
  copyText: (text: string): Promise<void> => ipcRenderer.invoke("clipboard:write", text),
  takeInvite: (): Promise<string | null> => ipcRenderer.invoke("invite:take"),
  onInvitePending: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("invite:pending", listener);
    return () => {
      ipcRenderer.removeListener("invite:pending", listener);
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
