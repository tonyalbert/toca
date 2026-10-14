import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { version } from "./package.json";

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
      // AudioWorklets precisam ser arquivos de verdade: um data: URL embutido
      // seria bloqueado pela CSP (script-src 'self')
      assetsInlineLimit: (file) => (file.endsWith(".worklet.js") ? false : undefined),
    },
  },
});
