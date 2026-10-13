import { session } from "electron";

/**
 * Player do YouTube na sessão de cinema. O app instalado roda em file://, e o
 * YouTube recusa tocar em página sem endereço de origem (erro 153). Mandamos o
 * site do Toca como Referer, só nos pedidos para o YouTube.
 */
const REFERER = "https://toca.rabbitapps.com.br/";

export function setupYouTube(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["https://www.youtube.com/*", "https://*.youtube.com/*", "https://www.youtube-nocookie.com/*"] },
    (details, callback) => {
      details.requestHeaders.Referer = REFERER;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}
