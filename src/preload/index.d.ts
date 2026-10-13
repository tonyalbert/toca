import type { ScreenAudioStartResult, ScreenSource } from "../shared/screen";
import type { UpdateState } from "../shared/update";
import type { PushToTalkBinding } from "../shared/pushToTalk";

declare global {
  interface Window {
    toca: {
      platform: string;
      getVersion(): Promise<string>;
      getUpdateState(): Promise<UpdateState>;
      checkForUpdates(): Promise<void>;
      /** Retorna a função que cancela a inscrição */
      onUpdateState(callback: (state: UpdateState) => void): () => void;
      installUpdate(): Promise<void>;
      /** Código de um link de convite (toca://convite/...) que abriu o app; vem uma vez só */
      takeInvite(): Promise<string | null>;
      /** Chegou um link de convite com o app aberto: chame takeInvite. Retorna a função que cancela. */
      onInvitePending(callback: () => void): () => void;
      /** Janela à vista (nem na bandeja, nem minimizada) */
      isWindowVisible(): Promise<boolean>;
      minimizeWindow(): Promise<void>;
      toggleMaximizeWindow(): Promise<void>;
      /** Esconde na bandeja (o app continua rodando) */
      closeWindow(): Promise<void>;
      isWindowMaximized(): Promise<boolean>;
      /** Retorna a função que cancela a inscrição */
      onWindowMaximized(callback: (maximized: boolean) => void): () => void;
      /** Liga a tecla de apertar para falar (null desliga a escuta do teclado) */
      setPushToTalk(binding: PushToTalkBinding | null): Promise<void>;
      /** Espera a próxima tecla ou botão lateral do mouse (Esc cancela: null) */
      recordPushToTalk(): Promise<{ binding: PushToTalkBinding; label: string } | null>;
      cancelRecordPushToTalk(): Promise<void>;
      /** Tecla apertada/solta; retorna a função que cancela a inscrição */
      onPushToTalk(callback: (pressed: boolean) => void): () => void;
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
