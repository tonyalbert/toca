import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
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
});
