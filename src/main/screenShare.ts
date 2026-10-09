import { app, desktopCapturer, ipcMain, session, type WebContents } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import type { ScreenAudioStartResult, ScreenSource } from "../shared/screen";

// Escolha feita no seletor do app, usada no próximo getDisplayMedia
let pendingSourceId: string | null = null;

// Captura do áudio do sistema sem o próprio Toca (native/audio-capture)
let audioHelper: ChildProcessWithoutNullStreams | null = null;

function audioHelperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "toca-audio-capture.exe")
    : join(app.getAppPath(), "native", "out", "toca-audio-capture.exe");
}

function stopAudioHelper(): void {
  audioHelper?.kill();
  audioHelper = null;
}

/**
 * Inicia o toca-audio-capture excluindo a árvore de processos do Toca e
 * repassa o PCM (s16le, 48 kHz, estéreo) para a janela via "screen:audio-data".
 */
function startAudioHelper(target: WebContents): Promise<ScreenAudioStartResult> {
  stopAudioHelper();
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "Áudio do computador só é suportado no Windows" });
  }

  const helper = spawn(audioHelperPath(), [String(process.pid)], { windowsHide: true });
  audioHelper = helper;

  helper.stdout.on("data", (chunk: Buffer) => {
    if (audioHelper === helper && !target.isDestroyed()) target.send("screen:audio-data", chunk);
  });

  return new Promise((resolve) => {
    let stderr = "";
    const finish = (result: ScreenAudioStartResult) => {
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      stopAudioHelper();
      finish({ ok: false, error: "A captura de áudio não respondeu" });
    }, 5000);

    helper.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.includes("READY")) finish({ ok: true });
    });
    helper.on("error", (err) => finish({ ok: false, error: err.message }));
    helper.on("exit", () => {
      if (audioHelper === helper) audioHelper = null;
      const message = stderr.match(/ERRO: (.*)/)?.[1]?.trim();
      finish({ ok: false, error: message ?? "A captura de áudio encerrou" });
    });
  });
}

/**
 * Compartilhamento de tela: o renderer mostra o próprio seletor (telas e
 * janelas, via desktopCapturer), registra a escolha aqui e então chama
 * getDisplayMedia (pelo LiveKit). O handler abaixo responde com a fonte
 * escolhida, sem o seletor padrão do Chromium.
 *
 * O áudio NÃO vem do getDisplayMedia: o loopback do Chromium captura tudo,
 * inclusive as vozes da chamada (eco para quem está na sala). Ele vem do
 * toca-audio-capture, que exclui o próprio Toca.
 */
export function setupScreenShare(): void {
  ipcMain.handle("screen:sources", async (): Promise<ScreenSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith("screen:") ? "screen" : "window",
      thumbnail: s.thumbnail.toDataURL(),
      icon: s.appIcon?.isEmpty() === false ? s.appIcon.toDataURL() : null,
    }));
  });

  ipcMain.handle("screen:select", (_e, sourceId: string) => {
    pendingSourceId = sourceId;
  });

  ipcMain.handle("screen:audio-start", (e) => {
    e.sender.once("destroyed", stopAudioHelper);
    return startAudioHelper(e.sender);
  });
  ipcMain.handle("screen:audio-stop", () => stopAudioHelper());
  app.on("before-quit", stopAudioHelper);

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sourceId = pendingSourceId;
    pendingSourceId = null;
    if (!sourceId) return callback(null);

    const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return callback(null); // janela fechada entre a escolha e a captura

    callback({ video: source });
  });
}
