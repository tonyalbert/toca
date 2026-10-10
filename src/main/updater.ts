import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "../shared/update";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

let state: UpdateState = { status: "idle" };
let pendingCheck: Promise<void> | null = null;

function setState(next: UpdateState): void {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("update:state", state);
  }
}

function check(): Promise<void> {
  // Depois de baixada, não há o que verificar até o usuário reiniciar
  if (!app.isPackaged || state.status === "downloading" || state.status === "downloaded") return Promise.resolve();
  if (pendingCheck) return pendingCheck;
  pendingCheck = autoUpdater.checkForUpdates().then(() => {}).catch((err: Error) => {
    console.error("[updater] falha ao verificar:", err.message);
    setState({ status: "error", message: err.message });
  }).finally(() => {
    pendingCheck = null;
  });
  return pendingCheck;
}

export function setupUpdater(): void {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("update:state", () => state);
  ipcMain.handle("update:check", () => check());
  ipcMain.handle("update:install", () => {
    if (state.status !== "downloaded") return;
    // isSilent=true: instala sem mostrar o assistente; isForceRunAfter=true: reabre o app
    autoUpdater.quitAndInstall(true, true);
  });

  // Em desenvolvimento (npm run dev) não existe instalação para atualizar
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se o usuário só fechar o app, instala na saída

  autoUpdater
    .on("checking-for-update", () => {
      setState({ status: "checking" });
    })
    .on("update-not-available", () => setState({ status: "up-to-date" }))
    .on("update-available", (info) =>
      setState({ status: "downloading", version: info.version, percent: 0 }),
    )
    .on("download-progress", (p) => {
      if (state.status === "downloading") {
        setState({ ...state, percent: Math.round(p.percent) });
      }
    })
    .on("update-downloaded", (info) => setState({ status: "downloaded", version: info.version }))
    .on("error", (err) => {
      console.error("[updater]", err);
      setState({ status: "error", message: err.message });
    });

  void check();
  const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
  app.once("before-quit", () => clearInterval(timer));
}
