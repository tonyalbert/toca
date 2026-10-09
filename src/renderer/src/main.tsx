import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fontes empacotadas no app (funcionam sem internet)
import "@fontsource-variable/sora";
import "@fontsource-variable/manrope";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { TooltipLayer } from "./components/Tooltip";
import { initTheme } from "./theme";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
      <TooltipLayer />
    </ConfirmProvider>
  </StrictMode>,
);
