/** Tecla (código do uiohook) ou botão do mouse que segura o microfone aberto */
export type PushToTalkBinding = { kind: "key"; code: number } | { kind: "mouse"; code: number };

/** Atalho global: tecla com Ctrl/Alt/Shift/Win, ou botão lateral do mouse */
export type ShortcutBinding =
  | { kind: "key"; code: number; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }
  | { kind: "mouse"; code: number };

/** O que dá para fazer com atalho, mesmo com outro programa em foco */
export const SHORTCUT_ACTIONS = ["toggleMute", "toggleDeafen", "toggleCamera", "toggleScreen", "leaveCall"] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
