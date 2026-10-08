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
    };
  }
}
