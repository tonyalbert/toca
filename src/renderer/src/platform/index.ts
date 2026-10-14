import { webNative } from "./web";

/**
 * Onde o Toca está rodando. A mesma interface roda no app de Windows (o
 * Electron entrega window.toca pelo preload) e no navegador (app-toca).
 *
 * Use sempre `native.x()` em vez de `window.toca.x()`: no desktop é a função
 * do Electron; no navegador (ou numa versão do desktop que ainda não tenha
 * uma função nova), cai na versão web.
 */

export type Native = Window["toca"];

const bridge = (window as { toca?: Partial<Native> }).toca;

/** Rodando no app de Windows */
export const isDesktop = !!bridge;

export const native: Native = { ...webNative, ...bridge };

const has = (name: keyof Native) => typeof bridge?.[name] === "function";

/** O que existe aqui (o que não existe some da interface) */
export const features = {
  /** Barra de título própria com minimizar/maximizar/fechar */
  windowControls: has("minimizeWindow"),
  /** Atualização do app pelo electron-updater */
  autoUpdate: has("checkForUpdates"),
  /** Atalhos que funcionam com outro programa em foco */
  globalShortcuts: has("setShortcuts"),
  /** Apertar para falar com o Toca em segundo plano (na web, só com a aba em foco) */
  globalPushToTalk: has("setPushToTalk"),
  /** Seletor de tela do Toca + som do computador (no navegador, o seletor é do próprio navegador) */
  nativeScreenShare: has("getScreenSources") && has("startScreenAudio"),
  /** Sessão em cookie httpOnly da API (no desktop, o Windows guarda o token) */
  cookieSession: !has("loadSession"),
};

/** Página de download do app para Windows */
export const DOWNLOAD_URL = "https://toca.rabbitapps.com.br";
