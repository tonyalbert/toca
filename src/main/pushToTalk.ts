import { BrowserWindow, app, ipcMain } from "electron";
import { UiohookKey, uIOhook, type UiohookKeyboardEvent, type UiohookMouseEvent } from "uiohook-napi";
import { SHORTCUT_ACTIONS, type PushToTalkBinding, type ShortcutAction, type ShortcutBinding } from "../shared/pushToTalk";
import { showWindow } from "./tray";

/**
 * Apertar para falar e atalhos globais: funcionam com outro programa em foco
 * (ex.: um jogo). O atalho global do Electron só avisa quando a tecla desce,
 * por isso o uiohook (precisamos saber quando ela sobe). A escuta do teclado
 * só fica ligada enquanto há algum atalho configurado (ou escolhendo um).
 */

const KEY_NAMES = new Map<number, string>(Object.entries(UiohookKey).map(([name, code]) => [code as number, name]));
const MOUSE_NAMES: Record<number, string> = { 3: "Botão do meio do mouse", 4: "Botão lateral do mouse (4)", 5: "Botão lateral do mouse (5)" };

export function bindingLabel(b: ShortcutBinding): string {
  if (b.kind === "mouse") return MOUSE_NAMES[b.code] ?? `Botão ${b.code} do mouse`;
  const name = (KEY_NAMES.get(b.code) ?? `Tecla ${b.code}`)
    .replace(/^Arrow/, "Seta ")
    .replace(/Right$/, " direito")
    .replace(/^Numpad/, "Num ");
  const mods = [b.ctrl && "Ctrl", b.alt && "Alt", b.shift && "Shift", b.meta && "Win"].filter(Boolean);
  return [...mods, name].join(" + ");
}

/** Teclas que sozinhas só modificam (na escolha de atalho, espera a tecla de verdade) */
const MODIFIER_KEYS = new Set<number>([
  UiohookKey.Ctrl, UiohookKey.CtrlRight, UiohookKey.Shift, UiohookKey.ShiftRight,
  UiohookKey.Alt, UiohookKey.AltRight, UiohookKey.Meta, UiohookKey.MetaRight,
]);

let binding: PushToTalkBinding | null = null;
let held = false;
let running = false;
let recording: ((b: ShortcutBinding | null) => void) | null = null;
/** Escolhendo um atalho com Ctrl/Alt/Shift (não o do apertar para falar) */
let recordingCombo = false;
let shortcuts: [ShortcutAction, ShortcutBinding][] = [];
/** Teclas seguradas agora: segurar a tecla não repete o atalho */
const down = new Set<number>();

function fire(action: ShortcutAction) {
  const wins = BrowserWindow.getAllWindows();
  // Compartilhar a tela abre o seletor: a janela precisa aparecer
  if (action === "toggleScreen" && wins[0]) showWindow(wins[0]);
  for (const win of wins) win.webContents.send("shortcut:fire", action);
}

const sameKey = (b: ShortcutBinding, e: UiohookKeyboardEvent) =>
  b.kind === "key" && b.code === e.keycode && !!b.ctrl === e.ctrlKey && !!b.alt === e.altKey && !!b.shift === e.shiftKey && !!b.meta === e.metaKey;

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
  const repeat = down.has(e.keycode);
  down.add(e.keycode);
  if (recording) {
    // Num atalho com Ctrl/Alt/Shift, espera a tecla que vem junto
    if (recordingCombo && MODIFIER_KEYS.has(e.keycode)) return;
    // Esc cancela a escolha
    const r = recording;
    recording = null;
    if (e.keycode === UiohookKey.Escape) r(null);
    else if (recordingCombo) r({ kind: "key", code: e.keycode, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
    else r({ kind: "key", code: e.keycode });
    sync();
    return;
  }
  if (matches("key", e.keycode)) setHeld(true);
  if (!repeat) for (const [action, b] of shortcuts) if (sameKey(b, e)) fire(action);
}
function onKeyUp(e: UiohookKeyboardEvent) {
  down.delete(e.keycode);
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
  for (const [action, b] of shortcuts) if (b.kind === "mouse" && b.code === button) fire(action);
}
function onMouseUp(e: UiohookMouseEvent) {
  if (matches("mouse", Number(e.button))) setHeld(false);
}

/** Liga a escuta só quando precisa (modo ativo ou escolhendo a tecla) */
function sync() {
  const needed = !!binding || !!recording || shortcuts.length > 0;
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
    down.clear();
    setHeld(false);
  }
}

/** Começa a escolher uma tecla; combo: atalho com Ctrl/Alt/Shift */
function record(combo: boolean) {
  return new Promise<{ binding: ShortcutBinding; label: string } | null>((resolve) => {
    recording?.(null);
    recordingCombo = combo;
    recording = (b) => resolve(b ? { binding: b, label: bindingLabel(b) } : null);
    sync();
  });
}

function cancelRecord() {
  const r = recording;
  recording = null;
  r?.(null);
  sync();
}

export function setupPushToTalk(): void {
  ipcMain.handle("ptt:set", (_e, next: PushToTalkBinding | null) => {
    binding = next;
    setHeld(false);
    sync();
  });
  ipcMain.handle("ptt:record", () => record(false));
  ipcMain.handle("ptt:cancel-record", cancelRecord);
  ipcMain.handle("shortcut:record", () => record(true));
  ipcMain.handle("shortcut:cancel-record", cancelRecord);
  ipcMain.handle("shortcuts:set", (_e, next: unknown) => {
    shortcuts = Array.isArray(next)
      ? next.filter(
          (item): item is [ShortcutAction, ShortcutBinding] =>
            Array.isArray(item) && (SHORTCUT_ACTIONS as readonly string[]).includes(item[0]) && typeof item[1]?.code === "number",
        )
      : [];
    sync();
  });
  app.on("before-quit", () => {
    if (running) uIOhook.stop();
    running = false;
  });
}
