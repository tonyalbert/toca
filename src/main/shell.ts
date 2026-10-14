import { app, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from "electron";

/**
 * Casca: o app de Windows abre a interface do app web (app-toca) e só
 * acrescenta o que é nativo (atalhos globais, bandeja, seletor de tela com o
 * som do PC, convites toca://, atualização da casca). Mudança na interface vai
 * pro ar com o deploy do site, sem versão nova do desktop.
 *
 * Segurança: os recursos nativos (window.toca) só existem para o endereço do
 * app. Qualquer outro site que apareça na janela não os vê (preload) nem
 * consegue chamá-los (ipcMain confere quem chamou), e a janela não navega para
 * fora: links de outros sites abrem no navegador padrão.
 */

const PRODUCTION_URL = "https://app-toca.rabbitapps.com.br";

/**
 * Endereço da interface. Desenvolvimento: o Vite do electron-vite, ou
 * TOCA_APP_URL (ex.: o build web local). O app instalado sempre usa o oficial.
 */
export const APP_URL = !app.isPackaged
  ? (process.env.TOCA_APP_URL ?? process.env.ELECTRON_RENDERER_URL ?? PRODUCTION_URL)
  : PRODUCTION_URL;
export const APP_ORIGIN = new URL(APP_URL).origin;

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/** Endereço dentro do app */
export const isAppUrl = (url: string) => originOf(url) === APP_ORIGIN;

/** Abre no navegador padrão, só http(s) (nada de file:, javascript: etc.) */
export function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

/** Quem chamou é a página do app, no quadro principal (não um iframe, nem outro site) */
function trusted(e: IpcMainInvokeEvent): boolean {
  const frame = e.senderFrame;
  return !!frame && frame === e.sender.mainFrame && isAppUrl(frame.url);
}

/**
 * Todo ipcMain.handle passa a conferir quem chamou. Chamar antes de registrar
 * os handlers (setupPushToTalk, setupSession etc.).
 */
export function guardIpc(): void {
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    handle(channel, (e, ...args) => {
      if (!trusted(e)) throw new Error("Origem não permitida");
      return listener(e, ...args);
    });
}

/** A janela só mostra o app; outros sites vão para o navegador */
export function lockNavigation(win: BrowserWindow): void {
  const contents = win.webContents;
  const guard = (e: Electron.Event, url: string) => {
    if (isAppUrl(url) || url.startsWith("data:text/html")) return;
    e.preventDefault();
    openExternal(url);
  };
  contents.on("will-navigate", guard);
  contents.on("will-redirect", guard);
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
}

/** Sem conexão: página embutida que tenta de novo sozinha e pelo botão */
function offlinePage(): string {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Toca</title>
<style>
  html, body { margin: 0; height: 100%; background: #08090b; color: #eef1f4; font-family: "Segoe UI", system-ui, sans-serif; }
  body { display: grid; place-items: center; -webkit-app-region: drag; }
  main { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; padding: 24px; }
  svg { width: 56px; height: 56px; }
  h1 { margin: 6px 0 0; font-size: 22px; }
  p { margin: 0; color: #98a2ad; font-size: 14px; max-width: 340px; line-height: 1.5; }
  button { -webkit-app-region: no-drag; margin-top: 8px; height: 40px; padding: 0 20px; border: 0; border-radius: 10px; background: #ffc83a; color: #141107; font: inherit; font-weight: 700; cursor: pointer; }
  button:hover { background: #ffd566; }
  .bar { position: fixed; top: 0; right: 0; -webkit-app-region: no-drag; }
  .bar button { margin: 0; width: 46px; height: 36px; border-radius: 0; background: none; color: #98a2ad; font-size: 18px; font-weight: 400; }
  .bar button:hover { background: #e5484d; color: #fff; }
</style></head>
<body>
<div class="bar"><button id="close" aria-label="Fechar" title="Fechar (o Toca continua na bandeja)">✕</button></div>
<main>
  <svg viewBox="0 0 96 96" aria-hidden="true"><rect width="96" height="96" rx="22" fill="#14171b"/><path d="M33 74 V45 A15 15 0 0 1 63 45 V74 Z" fill="#ffc83a"/></svg>
  <h1>Sem conexão</h1>
  <p>Não deu para abrir o Toca. Confira a internet: a gente tenta de novo sozinho a cada poucos segundos.</p>
  <button id="retry">Tentar de novo</button>
</main>
<script>
  const go = () => { location.href = ${JSON.stringify(APP_URL)}; };
  document.getElementById("retry").onclick = go;
  // Fechar esconde na bandeja, como no app (hideOnClose)
  document.getElementById("close").onclick = () => window.close();
  addEventListener("online", go);
  setTimeout(go, 8000);
</script>
</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** Carrega o app; se não abrir (sem internet, servidor fora), mostra a página "sem conexão" */
export function loadApp(win: BrowserWindow): void {
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    // -3: navegação cancelada (ex.: outra começou), não é falha
    if (!isMainFrame || code === -3 || !isAppUrl(url)) return;
    void win.loadURL(offlinePage());
  });
  void win.loadURL(APP_URL);
}
