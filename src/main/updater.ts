import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UpdateState } from "../shared/update";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 min
// Ao voltar para a janela, verifica de novo se a última verificação tem mais que isto
const CHECK_ON_FOCUS_MS = 3 * 60 * 1000;
// latest.yml da última release, direto. O feed do GitHub (releases.atom) que o
// provedor "github" usa demora a mostrar uma release nova; este link não.
const FEED_URL = "https://github.com/tonyalbert/toca-releases/releases/latest/download";

let state: UpdateState = { status: "idle" };
let pendingCheck: Promise<void> | null = null;
let lastCheck = 0;
// Verificação pedida pelo usuário (botão): só ela mostra "verificando" e erros;
// as de fundo ficam quietas para a barra de título não piscar a cada 10 min
let manualCheck = false;

function setState(next: UpdateState): void {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("update:state", state);
  }
}

function check(manual = false): Promise<void> {
  // Depois de baixada, não há o que verificar até o usuário reiniciar
  if (!app.isPackaged || state.status === "downloading" || state.status === "downloaded") return Promise.resolve();
  if (manual) {
    manualCheck = true;
    setState({ status: "checking" });
  }
  if (pendingCheck) return pendingCheck;
  lastCheck = Date.now();
  pendingCheck = autoUpdater.checkForUpdates().then(() => {}).catch((err: Error) => {
    console.error("[updater] falha ao verificar:", err.message);
    if (manualCheck) setState({ status: "error", message: err.message });
  }).finally(() => {
    pendingCheck = null;
    manualCheck = false;
  });
  return pendingCheck;
}

// Como a janela estava ao atualizar, para o app reabrir do mesmo jeito
type WindowMode = "shown" | "minimized" | "hidden";
const restartFile = () => join(app.getPath("userData"), "update-restart.json");

/** Lida uma vez ao abrir: o app acabou de se atualizar escondido ou minimizado? */
export function takeRestartMode(): WindowMode {
  const file = restartFile();
  if (!existsSync(file)) return "shown";
  try {
    const { mode, at } = JSON.parse(readFileSync(file, "utf8")) as { mode: WindowMode; at: number };
    // Só vale logo depois da atualização
    return Date.now() - at < 5 * 60 * 1000 ? mode : "shown";
  } catch {
    return "shown";
  } finally {
    rmSync(file, { force: true });
  }
}

export function setupUpdater(): void {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("update:state", () => state);
  ipcMain.handle("update:check", () => check(true));
  ipcMain.handle("update:install", (e) => {
    if (state.status !== "downloaded") return;
    const win = BrowserWindow.fromWebContents(e.sender);
    const mode: WindowMode = !win || !win.isVisible() ? "hidden" : win.isMinimized() ? "minimized" : "shown";
    try {
      writeFileSync(restartFile(), JSON.stringify({ mode, at: Date.now() }));
    } catch {
      // sem isso o app só reabre com a janela à mostra
    }
    // À vista, o instalador mostra a janelinha de progresso dele (para ninguém
    // achar que o app fechou de vez); na bandeja ou minimizado, instala calado.
    // isForceRunAfter=true: reabre o app no fim
    autoUpdater.quitAndInstall(mode !== "shown", true);
  });
  // A janela está à vista? (escondida na bandeja ou minimizada: não)
  ipcMain.handle("window:is-visible", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return !!win && win.isVisible() && !win.isMinimized();
  });

  // Em desenvolvimento (npm run dev) não existe instalação para atualizar
  if (!app.isPackaged) return;

  autoUpdater.setFeedURL({ provider: "generic", url: FEED_URL });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se o usuário só fechar o app, instala na saída

  autoUpdater
    .on("update-not-available", () => {
      if (manualCheck || state.status === "checking" || state.status === "error") setState({ status: "up-to-date" });
    })
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
      // Falha no download sempre aparece; na verificação de fundo, não
      if (manualCheck || state.status === "downloading") setState({ status: "error", message: err.message });
    });

  void check();
  const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
  app.once("before-quit", () => clearInterval(timer));
  // Voltou para o app ou o PC acordou: confere se saiu versão nova
  app.on("browser-window-focus", () => {
    if (Date.now() - lastCheck > CHECK_ON_FOCUS_MS) void check();
  });
  powerMonitor.on("resume", () => void check());
}
