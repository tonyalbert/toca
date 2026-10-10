import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { join } from "node:path";
import { appIcon, hideOnClose, setupTray, showWindow } from "./tray";
import { setupScreenShare } from "./screenShare";
import { setupSession } from "./session";
import { setupPushToTalk } from "./pushToTalk";
import { setupUpdater, takeRestartMode } from "./updater";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    // Sem a moldura do Windows: a barra de título é desenhada pelo app (TitleBar.tsx)
    frame: false,
    title: "Toca",
    backgroundColor: "#08090b",
    autoHideMenuBar: true,
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Áudio dos outros participantes toca sem precisar de clique
      autoplayPolicy: "no-user-gesture-required",
      // Continua a chamada a todo vapor mesmo com a janela escondida na bandeja
      backgroundThrottling: false,
    },
  });
  mainWindow = win;

  // Depois de uma atualização feita com o app na bandeja (ou minimizado), volta assim
  const mode = takeRestartMode();
  win.once("ready-to-show", () => {
    if (mode === "minimized") win.minimize();
    else if (mode === "shown") win.show();
  });
  // O botão de maximizar troca de ícone conforme o estado da janela
  const sendMaximized = () => win.webContents.send("window:maximized", win.isMaximized());
  win.on("maximize", sendMaximized);
  win.on("unmaximize", sendMaximized);
  hideOnClose(win);
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Links externos abrem no navegador, nunca dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/** Botões da barra de título. Fechar só esconde na bandeja (ver hideOnClose). */
function setupWindowControls(): void {
  const target = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle("window:minimize", (e) => target(e)?.minimize());
  ipcMain.handle("window:toggle-maximize", (e) => {
    const win = target(e);
    if (win) (win.isMaximized() ? win.unmaximize() : win.maximize());
  });
  ipcMain.handle("window:close", (e) => target(e)?.close());
  ipcMain.handle("window:is-maximized", (e) => target(e)?.isMaximized() ?? false);
}

// Em desenvolvimento (npm run dev) usa uma pasta de dados separada, para rodar
// junto com o Toca instalado em vez de só trazer a janela dele para frente
if (!app.isPackaged) {
  app.setPath("userData", `${app.getPath("userData")}-dev`);
}

// Uma instância só: abrir o atalho de novo traz a janela existente para frente
// (inclusive quando ela está escondida na bandeja)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) showWindow(mainWindow);
  });

  app.whenReady().then(() => {
    // Nome do app nas notificações do Windows (igual ao appId do electron-builder.yml)
    app.setAppUserModelId("br.com.rabbitapps.toca");

    // Microfone/câmera (media), captura de tela e tela cheia são liberados; o resto é negado
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === "media" || permission === "display-capture" || permission === "fullscreen");
    });

    setupWindowControls();
    setupPushToTalk();
    setupScreenShare();
    setupSession();

    setupUpdater();
    setupTray(() => mainWindow);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
