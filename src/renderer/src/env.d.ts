/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

/** Versão do package.json no build (vite define) */
declare const __APP_VERSION__: string;
