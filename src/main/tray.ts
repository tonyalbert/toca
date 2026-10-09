import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import iconPath from "../../build/icon.png?asset";
import trayPath from "../../build/tray.png?asset";
import tray2xPath from "../../build/tray@2x.png?asset";

let tray: Tray | null = null;
let quitting = false;
let hintShown = false;

export const appIcon = nativeImage.createFromPath(iconPath);

function trayIcon(): Electron.NativeImage {
  // A bandeja do Windows usa 16px em 100% de escala e 32px em 200%. O de 16px
  // é desenhado à parte (arco mais largo), por isso não sai de um resize.
  const image = nativeImage.createFromPath(trayPath);
  image.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(tray2xPath).toPNG() });
  return image;
}

export function showWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/**
 * Fechar a janela só esconde o app na bandeja; ele continua rodando (e na
 * chamada, se estiver em uma). Para encerrar de verdade: "Sair" no menu da
 * bandeja, ou um app.quit() vindo do atualizador.
 */
export function setupTray(getWindow: () => BrowserWindow | null): void {
  app.on("before-quit", () => {
    quitting = true;
  });

  tray = new Tray(trayIcon());
  tray.setToolTip("Toca");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Abrir Toca",
        click: () => {
          const win = getWindow();
          if (win) showWindow(win);
        },
      },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => {
    const win = getWindow();
    if (win) showWindow(win);
  });
}

export function hideOnClose(win: BrowserWindow): void {
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();

    // Na primeira vez, avisa onde o app foi parar
    if (!hintShown && tray) {
      hintShown = true;
      tray.displayBalloon({
        title: "O Toca continua aberto",
        content: "Ele fica aqui na bandeja. Para encerrar, clique com o botão direito e escolha Sair.",
        iconType: "none",
        icon: appIcon,
      });
    }
  });
}
