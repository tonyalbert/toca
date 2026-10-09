import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      // AudioWorklets precisam ser arquivos de verdade: um data: URL embutido
      // seria bloqueado pela CSP (script-src 'self')
      assetsInlineLimit: (file) => (file.endsWith(".worklet.js") ? false : undefined),
    },
  },
});
