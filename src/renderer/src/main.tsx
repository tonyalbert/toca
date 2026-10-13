import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fontes empacotadas no app (funcionam sem internet)
import "@fontsource-variable/sora";
import "@fontsource-variable/manrope";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { TooltipLayer } from "./components/Tooltip";
import { ToastProvider } from "./components/Toasts";
import { initTheme } from "./theme";
import { syncShortcuts } from "./shortcuts";
import "./styles/tokens.css";
import "./styles/palettes.css";
import "./styles/components.css";

initTheme();
// Atalhos globais salvos: o processo principal começa a escutar o teclado
syncShortcuts();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfirmProvider>
      <ToastProvider>
        <App />
        <TooltipLayer />
      </ToastProvider>
    </ConfirmProvider>
  </StrictMode>,
);
