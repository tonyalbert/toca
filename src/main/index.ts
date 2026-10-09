import { app, BrowserWindow, session, shell } from "electron";
import { join } from "node:path";
import { appIcon, hideOnClose, setupTray, showWindow } from "./tray";
import { setupUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 760,
    minHeight: 480,
    title: "Toca",
    backgroundColor: "#1e1f22",
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

  win.once("ready-to-show", () => win.show());
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

    // Só o microfone (media) é liberado; qualquer outra permissão é negada
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === "media");
    });

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
