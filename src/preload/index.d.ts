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
