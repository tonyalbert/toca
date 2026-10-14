import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { version } from "./package.json";

/**
 * App web (app-toca.rabbitapps.com.br): a mesma interface do desktop, como
 * site estático. `npm run build:web` gera dist-web/, servido pelo nginx
 * (Dockerfile.web). O desktop continua com o electron.vite.config.ts.
 */

/** version.json: o app aberto confere de tempos em tempos se saiu um build novo */
const versionFile = (): Plugin => ({
  name: "toca-version-json",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version }) });
  },
});

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  base: "/",
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: resolve(__dirname, "dist-web"),
    emptyOutDir: true,
    // O LiveKit sozinho passa de 500 kB; o app carrega uma vez e fica aberto
    chunkSizeWarningLimit: 1500,
    // AudioWorklets precisam ser arquivos de verdade (CSP script-src 'self')
    assetsInlineLimit: (file) => (file.endsWith(".worklet.js") ? false : undefined),
  },
  server: { port: 5173, strictPort: true },
});
