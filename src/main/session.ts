import { app, ipcMain, safeStorage } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Guarda o refresh token da conta criptografado pelo Windows (DPAPI, via
 * safeStorage): só este usuário do Windows neste PC consegue ler o arquivo.
 * O access token fica só na memória do app.
 */
const sessionFile = () => join(app.getPath("userData"), "session.bin");

async function load(): Promise<string | null> {
  try {
    const data = await readFile(sessionFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : null;
  } catch {
    return null; // sem sessão salva ou arquivo de outro usuário/PC
  }
}

async function save(token: string | null): Promise<void> {
  if (!token || !safeStorage.isEncryptionAvailable()) {
    await rm(sessionFile(), { force: true });
    return;
  }
  await writeFile(sessionFile(), safeStorage.encryptString(token));
}

// Gravações em ordem: renovações seguidas não se atropelam
let queue: Promise<void> = Promise.resolve();

export function setupSession(): void {
  ipcMain.handle("session:load", () => load());
  ipcMain.handle("session:save", (_e, token: unknown) => {
    const value = typeof token === "string" && token.length <= 512 ? token : null;
    queue = queue.then(() => save(value)).catch(() => {});
    return queue;
  });
}
