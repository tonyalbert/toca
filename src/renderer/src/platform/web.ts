import type { PushToTalkBinding } from "../../../shared/pushToTalk";
import type { UpdateState } from "../../../shared/update";
import { bindingLabel, uiohookCode, uiohookMouse } from "./keys";

/**
 * O que o desktop faz pelo Electron (window.toca), feito com o que o navegador
 * oferece. O que não existe na web (atalhos globais, bandeja, atualização do
 * app, botões da janela) vira "não faz nada": a interface esconde esses itens
 * (ver features em platform/index.ts).
 */

type Native = Window["toca"];
const noop = async () => {};
const unsubscribeNoop = () => () => {};

// ---------- apertar para falar (só com a aba em foco) ----------

let pttBinding: PushToTalkBinding | null = null;
let pttHeld = false;
const pttListeners = new Set<(pressed: boolean) => void>();
let recording: ((b: PushToTalkBinding | null) => void) | null = null;

function setHeld(pressed: boolean) {
  if (pttHeld === pressed) return;
  pttHeld = pressed;
  for (const listener of pttListeners) listener(pressed);
}

/** Digitando no chat: a tecla de falar não deve abrir o microfone */
const typing = (e: Event) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
};

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e) => {
      if (recording) {
        e.preventDefault();
        const code = uiohookCode(e);
        const done = recording;
        recording = null;
        done(e.code === "Escape" || code === null ? null : { kind: "key", code });
        return;
      }
      if (pttBinding?.kind === "key" && uiohookCode(e) === pttBinding.code && !typing(e)) setHeld(true);
    },
    true,
  );
  window.addEventListener("keyup", (e) => {
    if (pttBinding?.kind === "key" && uiohookCode(e) === pttBinding.code) setHeld(false);
  });
  window.addEventListener(
    "mousedown",
    (e) => {
      const code = uiohookMouse(e.button);
      if (recording && code !== null) {
        e.preventDefault();
        const done = recording;
        recording = null;
        done({ kind: "mouse", code });
        return;
      }
      if (pttBinding?.kind === "mouse" && code === pttBinding.code) setHeld(true);
    },
    true,
  );
  window.addEventListener("mouseup", (e) => {
    if (pttBinding?.kind === "mouse" && uiohookMouse(e.button) === pttBinding.code) setHeld(false);
  });
  // Saiu da aba segurando a tecla: o navegador não avisa quando ela sobe
  window.addEventListener("blur", () => setHeld(false));
}

// ---------- inatividade ----------

let lastActivity = Date.now();
if (typeof window !== "undefined") {
  for (const type of ["pointermove", "pointerdown", "keydown", "wheel"]) {
    window.addEventListener(type, () => (lastActivity = Date.now()), { passive: true });
  }
}

// ---------- convite pelo endereço (/convite/<código>) ----------

const INVITE_PATH = /^\/convite\/([A-Za-z0-9_-]{16,64})\/?$/;

function takeInviteFromUrl(): string | null {
  const match = INVITE_PATH.exec(window.location.pathname);
  if (!match) return null;
  // Uma vez só: recarregar a página não abre o convite de novo
  window.history.replaceState(null, "", "/");
  return match[1];
}

// ---------- copiar ----------

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Navegador sem permissão: o jeito antigo
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("Não deu para copiar");
  }
}

export const webNative: Native = {
  platform: "web",
  getVersion: async () => __APP_VERSION__,
  getUpdateState: async (): Promise<UpdateState> => ({ status: "idle" }),
  checkForUpdates: noop,
  onUpdateState: unsubscribeNoop,
  installUpdate: noop,
  copyText,
  takeInvite: async () => takeInviteFromUrl(),
  onInvitePending: unsubscribeNoop,
  isWindowVisible: async () => document.visibilityState === "visible",
  getIdleSeconds: async () => (Date.now() - lastActivity) / 1000,
  minimizeWindow: noop,
  toggleMaximizeWindow: noop,
  closeWindow: noop,
  isWindowMaximized: async () => false,
  onWindowMaximized: unsubscribeNoop,
  setPushToTalk: async (binding) => {
    pttBinding = binding;
    if (!binding) setHeld(false);
  },
  recordPushToTalk: () =>
    new Promise((resolve) => {
      recording?.(null);
      recording = (b) => resolve(b ? { binding: b, label: bindingLabel(b) } : null);
    }),
  cancelRecordPushToTalk: async () => {
    const done = recording;
    recording = null;
    done?.(null);
  },
  setShortcuts: noop,
  recordShortcut: async () => null,
  cancelRecordShortcut: noop,
  onShortcut: unsubscribeNoop,
  onPushToTalk: (callback) => {
    pttListeners.add(callback);
    return () => {
      pttListeners.delete(callback);
    };
  },
  // A sessão da web fica num cookie httpOnly da API (ver api.ts)
  loadSession: async () => null,
  saveSession: noop,
  getScreenSources: async () => [],
  selectScreenSource: noop,
  startScreenAudio: async () => {
    throw new Error("Som do computador só no app para Windows");
  },
  stopScreenAudio: noop,
  onScreenAudioData: unsubscribeNoop,
};
