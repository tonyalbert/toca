import { app, ipcMain, type BrowserWindow } from "electron";

/**
 * Links de convite: toca://convite/<código>. A página do site
 * (toca.rabbitapps.com.br/convite/<código>) abre este endereço, o Windows
 * chama o Toca com ele na linha de comando e o código fica guardado até o app
 * (já com a conta aberta) pegar.
 */
const PROTOCOL = "toca";
const LINK = /^toca:\/\/convite\/([A-Za-z0-9_-]{16,64})\/?$/i;

let pending: string | null = null;

const inviteFrom = (argv: string[]) => argv.map((arg) => LINK.exec(arg)?.[1]).find(Boolean) ?? null;

export function setupInvites(getWindow: () => BrowserWindow | null, show: (win: BrowserWindow) => void): void {
  // Em desenvolvimento não registra: tomaria o lugar do Toca instalado
  if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL);

  pending = inviteFrom(process.argv);

  // O Toca já estava aberto: o Windows abre outra instância com o link, que avisa esta e fecha
  app.on("second-instance", (_event, argv) => {
    const token = inviteFrom(argv);
    if (!token) return;
    pending = token;
    const win = getWindow();
    if (win) {
      show(win);
      win.webContents.send("invite:pending");
    }
  });

  // O app pega o código uma vez só (depois de entrar na conta)
  ipcMain.handle("invite:take", () => {
    const token = pending;
    pending = null;
    return token;
  });
}
