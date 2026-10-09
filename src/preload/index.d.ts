import type { ScreenAudioStartResult, ScreenSource } from "../shared/screen";
import type { UpdateState } from "../shared/update";

declare global {
  interface Window {
    toca: {
      platform: string;
      getVersion(): Promise<string>;
      getUpdateState(): Promise<UpdateState>;
      /** Retorna a função que cancela a inscrição */
      onUpdateState(callback: (state: UpdateState) => void): () => void;
      installUpdate(): Promise<void>;
      minimizeWindow(): Promise<void>;
      toggleMaximizeWindow(): Promise<void>;
      /** Esconde na bandeja (o app continua rodando) */
      closeWindow(): Promise<void>;
      isWindowMaximized(): Promise<boolean>;
      /** Retorna a função que cancela a inscrição */
      onWindowMaximized(callback: (maximized: boolean) => void): () => void;
      /** Refresh token salvo (criptografado pelo Windows), ou null */
      loadSession(): Promise<string | null>;
      /** null apaga a sessão salva */
      saveSession(refreshToken: string | null): Promise<void>;
      getScreenSources(): Promise<ScreenSource[]>;
      /** Registra a escolha do seletor; vale para o próximo getDisplayMedia */
      selectScreenSource(sourceId: string): Promise<void>;
      /** Áudio do computador sem o próprio Toca (PCM s16le, 48 kHz, estéreo) */
      startScreenAudio(): Promise<ScreenAudioStartResult>;
      stopScreenAudio(): Promise<void>;
      /** Retorna a função que cancela a inscrição */
      onScreenAudioData(callback: (chunk: Uint8Array) => void): () => void;
    };
  }
}
