import { useEffect, useState } from "react";
import type { UpdateState } from "../../shared/update";
import { native } from "./platform";

/** De quanto em quanto tempo a página confere se saiu um build novo */
const PAGE_CHECK_MS = 5 * 60 * 1000;

/**
 * Página servida pela internet (app web, ou o desktop carregando o app-toca):
 * um build novo no servidor vira "atualização" que se instala recarregando.
 * No app empacotado (file://) e em desenvolvimento, não se aplica.
 */
const servedPage = typeof location !== "undefined" && location.protocol.startsWith("http") && !import.meta.env.DEV;

/** Versão nova da página no servidor (version.json gerado no build), ou null */
function usePageUpdate(): string | null {
  const [available, setAvailable] = useState<string | null>(null);
  useEffect(() => {
    if (!servedPage) return;
    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        const { version } = (await res.json()) as { version?: string };
        if (version && version !== __APP_VERSION__) setAvailable(version);
      } catch {
        // sem rede: tenta na próxima
      }
    };
    const id = setInterval(check, PAGE_CHECK_MS);
    const onFocus = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  return available;
}

export function useAppUpdate() {
  // Versão da interface (a do build); no desktop-casca, a do app pode ser outra
  const version = __APP_VERSION__;
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });
  const page = usePageUpdate();

  useEffect(() => {
    let receivedEvent = false;
    let active = true;
    const unsubscribe = native.onUpdateState((next) => {
      receivedEvent = true;
      setUpdate(next);
    });
    void native.getUpdateState().then((initial) => {
      if (active && !receivedEvent) setUpdate(initial);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Atualização do app (desktop) primeiro; senão, a da página
  if (update.status !== "downloaded" && page) {
    return { version, update: { status: "downloaded", version: page } as UpdateState, install: () => location.reload() };
  }
  return { version, update, install: () => void native.installUpdate() };
}
