import { BrowserWindow, app, ipcMain } from "electron";
import { UiohookKey, uIOhook, type UiohookKeyboardEvent, type UiohookMouseEvent } from "uiohook-napi";
import type { PushToTalkBinding } from "../shared/pushToTalk";

/**
 * Apertar para falar com tecla global: funciona com outro programa em foco
 * (ex.: um jogo). O atalho global do Electron só avisa quando a tecla desce,
 * por isso o uiohook (precisamos saber quando ela sobe). A escuta do teclado
 * só fica ligada enquanto o modo está ativo.
 */

const KEY_NAMES = new Map<number, string>(Object.entries(UiohookKey).map(([name, code]) => [code as number, name]));
const MOUSE_NAMES: Record<number, string> = { 3: "Botão do meio do mouse", 4: "Botão lateral do mouse (4)", 5: "Botão lateral do mouse (5)" };

export function bindingLabel(b: PushToTalkBinding): string {
  if (b.kind === "mouse") return MOUSE_NAMES[b.code] ?? `Botão ${b.code} do mouse`;
  const name = KEY_NAMES.get(b.code) ?? `Tecla ${b.code}`;
  return name.replace(/^Arrow/, "Seta ").replace(/Right$/, " direito").replace(/^Numpad/, "Num ");
}

let binding: PushToTalkBinding | null = null;
let held = false;
let running = false;
let recording: ((b: PushToTalkBinding | null) => void) | null = null;

function broadcast(pressed: boolean) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send("ptt:state", pressed);
}

function setHeld(pressed: boolean) {
  if (pressed === held) return;
  held = pressed;
  broadcast(pressed);
}

const matches = (kind: "key" | "mouse", code: number) => binding?.kind === kind && binding.code === code;

function onKeyDown(e: UiohookKeyboardEvent) {
  if (recording) {
    // Esc cancela a escolha
    const r = recording;
    recording = null;
    r(e.keycode === UiohookKey.Escape ? null : { kind: "key", code: e.keycode });
    sync();
    return;
  }
  if (matches("key", e.keycode)) setHeld(true);
}
function onKeyUp(e: UiohookKeyboardEvent) {
  if (matches("key", e.keycode)) setHeld(false);
}
function onMouseDown(e: UiohookMouseEvent) {
  const button = Number(e.button);
  // Botões esquerdo e direito não servem (todo clique falaria)
  if (recording && button >= 3) {
    const r = recording;
    recording = null;
    r({ kind: "mouse", code: button });
    sync();
    return;
  }
  if (matches("mouse", button)) setHeld(true);
}
function onMouseUp(e: UiohookMouseEvent) {
  if (matches("mouse", Number(e.button))) setHeld(false);
}

/** Liga a escuta só quando precisa (modo ativo ou escolhendo a tecla) */
function sync() {
  const needed = !!binding || !!recording;
  if (needed && !running) {
    uIOhook.on("keydown", onKeyDown);
    uIOhook.on("keyup", onKeyUp);
    uIOhook.on("mousedown", onMouseDown);
    uIOhook.on("mouseup", onMouseUp);
    uIOhook.start();
    running = true;
  } else if (!needed && running) {
    uIOhook.removeAllListeners();
    uIOhook.stop();
    running = false;
    setHeld(false);
  }
}

export function setupPushToTalk(): void {
  ipcMain.handle("ptt:set", (_e, next: PushToTalkBinding | null) => {
    binding = next;
    setHeld(false);
    sync();
  });
  ipcMain.handle(
    "ptt:record",
    () =>
      new Promise<{ binding: PushToTalkBinding; label: string } | null>((resolve) => {
        recording?.(null);
        recording = (b) => resolve(b ? { binding: b, label: bindingLabel(b) } : null);
        sync();
      }),
  );
  ipcMain.handle("ptt:cancel-record", () => {
    const r = recording;
    recording = null;
    r?.(null);
    sync();
  });
  app.on("before-quit", () => {
    if (running) uIOhook.stop();
    running = false;
  });
}
