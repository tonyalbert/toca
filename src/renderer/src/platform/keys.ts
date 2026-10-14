import type { ShortcutBinding } from "../../../shared/pushToTalk";

/**
 * Teclas do navegador (KeyboardEvent.code) nos códigos do uiohook, que o
 * desktop usa: a tecla de apertar para falar salva vale nos dois.
 */
const CODES: Record<string, number> = {
  Backspace: 14, Tab: 15, Enter: 28, CapsLock: 58, Escape: 1, Space: 57,
  PageUp: 3657, PageDown: 3665, End: 3663, Home: 3655, Insert: 3666, Delete: 3667,
  ArrowLeft: 57419, ArrowUp: 57416, ArrowRight: 57421, ArrowDown: 57424,
  Digit0: 11, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10,
  KeyA: 30, KeyB: 48, KeyC: 46, KeyD: 32, KeyE: 18, KeyF: 33, KeyG: 34, KeyH: 35, KeyI: 23, KeyJ: 36,
  KeyK: 37, KeyL: 38, KeyM: 50, KeyN: 49, KeyO: 24, KeyP: 25, KeyQ: 16, KeyR: 19, KeyS: 31, KeyT: 20,
  KeyU: 22, KeyV: 47, KeyW: 17, KeyX: 45, KeyY: 21, KeyZ: 44,
  Numpad0: 82, Numpad1: 79, Numpad2: 80, Numpad3: 81, Numpad4: 75, Numpad5: 76, Numpad6: 77, Numpad7: 71,
  Numpad8: 72, Numpad9: 73, NumpadMultiply: 55, NumpadAdd: 78, NumpadSubtract: 74, NumpadDecimal: 83, NumpadDivide: 3637,
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  Semicolon: 39, Equal: 13, Comma: 51, Minus: 12, Period: 52, Slash: 53, Backquote: 41,
  BracketLeft: 26, Backslash: 43, BracketRight: 27, Quote: 40,
  ControlLeft: 29, ControlRight: 3613, AltLeft: 56, AltRight: 3640, ShiftLeft: 42, ShiftRight: 54,
  MetaLeft: 3675, MetaRight: 3676,
};

const NAMES = new Map(
  Object.entries(CODES).map(([code, n]) => [
    n,
    code
      .replace(/^Key|^Digit/, "")
      .replace(/^Arrow(.*)/, "Seta $1")
      .replace(/^Numpad/, "Num ")
      .replace(/^Control/, "Ctrl")
      .replace(/^Meta/, "Win")
      .replace(/Left$/, "")
      .replace(/Right$/, " direito"),
  ]),
);

/** Código do uiohook da tecla (null: tecla sem equivalente) */
export const uiohookCode = (e: KeyboardEvent): number | null => CODES[e.code] ?? null;

/** Botão do mouse no navegador (1 meio, 3 e 4 laterais) no número do uiohook */
export const uiohookMouse = (button: number): number | null => ({ 1: 3, 3: 4, 4: 5 })[button] ?? null;

const MOUSE_NAMES: Record<number, string> = { 3: "Botão do meio do mouse", 4: "Botão lateral do mouse (4)", 5: "Botão lateral do mouse (5)" };

/** Mesmo texto que o desktop mostra (main/pushToTalk.ts) */
export function bindingLabel(b: ShortcutBinding): string {
  if (b.kind === "mouse") return MOUSE_NAMES[b.code] ?? `Botão ${b.code} do mouse`;
  const mods = [b.ctrl && "Ctrl", b.alt && "Alt", b.shift && "Shift", b.meta && "Win"].filter(Boolean);
  return [...mods, NAMES.get(b.code) ?? `Tecla ${b.code}`].join(" + ");
}
