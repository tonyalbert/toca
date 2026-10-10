/** Tecla (código do uiohook) ou botão do mouse que segura o microfone aberto */
export type PushToTalkBinding = { kind: "key"; code: number } | { kind: "mouse"; code: number };
