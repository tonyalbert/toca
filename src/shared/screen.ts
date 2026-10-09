/** Tela ou janela que pode ser compartilhada (vinda do desktopCapturer) */
export interface ScreenSource {
  id: string;
  name: string;
  type: "screen" | "window";
  /** Miniatura em data URL */
  thumbnail: string;
  /** Ícone do aplicativo (só para janelas) */
  icon: string | null;
}

export type ScreenAudioStartResult = { ok: true } | { ok: false; error: string };
