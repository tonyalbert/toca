import { useEffect, useState } from "react";
import { SHORTCUT_ACTIONS, type ShortcutAction, type ShortcutBinding } from "../../shared/pushToTalk";

/** Atalhos globais (Configurações → Atalhos). Ficam salvos neste PC. */
export interface SavedShortcut {
  binding: ShortcutBinding;
  /** Como aparece na tela (ex.: "Ctrl + Shift + M") */
  label: string;
}
export type Shortcuts = Partial<Record<ShortcutAction, SavedShortcut>>;

export const SHORTCUT_INFO: { id: ShortcutAction; title: string; hint: string }[] = [
  { id: "toggleMute", title: "Ligar/desligar o microfone", hint: "Na chamada, mesmo com o jogo em foco." },
  { id: "toggleDeafen", title: "Ligar/desligar o fone", hint: "Para de ouvir a sala (e desliga o microfone)." },
  { id: "toggleCamera", title: "Ligar/desligar a câmera", hint: "Na chamada." },
  { id: "toggleScreen", title: "Compartilhar a tela", hint: "Abre o Toca para escolher a tela; se já está compartilhando, para." },
  { id: "leaveCall", title: "Sair da chamada", hint: "Sai da sala em que você está." },
];

const STORAGE_KEY = "toca.shortcuts";
const listeners = new Set<(s: Shortcuts) => void>();

function load(): Shortcuts {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Shortcuts;
    return Object.fromEntries(
      Object.entries(saved).filter(([id, s]) => (SHORTCUT_ACTIONS as readonly string[]).includes(id) && typeof s?.binding?.code === "number"),
    ) as Shortcuts;
  } catch {
    return {};
  }
}

let current = load();

/** Manda os atalhos para o processo principal (que escuta o teclado) */
export function syncShortcuts(): void {
  void window.toca.setShortcuts(
    Object.entries(current).map(([id, s]) => [id as ShortcutAction, s!.binding] as [ShortcutAction, ShortcutBinding]),
  );
}

export function setShortcut(action: ShortcutAction, value: SavedShortcut | null): void {
  current = { ...current };
  if (value) current[action] = value;
  else delete current[action];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // vale até fechar o app
  }
  syncShortcuts();
  listeners.forEach((l) => l(current));
}

export function useShortcuts(): Shortcuts {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => void listeners.delete(setValue);
  }, []);
  return value;
}

/** Mesmo atalho (tecla e modificadores, ou o mesmo botão do mouse) */
export function sameBinding(a: ShortcutBinding, b: ShortcutBinding): boolean {
  if (a.kind !== b.kind || a.code !== b.code) return false;
  if (a.kind === "mouse" || b.kind === "mouse") return true;
  return !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift && !!a.meta === !!b.meta;
}

/**
 * Atalho que liga/desliga precisa de Ctrl/Alt/Shift/Win, ser F1–F24 ou um
 * botão do mouse: senão dispara enquanto a pessoa digita.
 */
export function safeForToggle(s: SavedShortcut): boolean {
  const b = s.binding;
  if (b.kind === "mouse") return true;
  if (b.ctrl || b.alt || b.meta) return true;
  return /^F\d{1,2}$/.test(s.label.replace(/^Shift \+ /, ""));
}
