import { useEffect, useRef } from "react";
import type { UpdateState } from "../../shared/update";
import { native } from "./platform";

/** De quanto em quanto tempo confere se dá para atualizar */
const POLL_MS = 60 * 1000;
/** Fora de chamada há pelo menos isto (uma queda rápida da chamada não conta) */
const OUT_OF_CALL_MS = 5 * 60 * 1000;
/** Ninguém mexendo no PC há pelo menos isto */
const IDLE_S = 15 * 60;

/**
 * Atualização discreta: com a versão nova baixada, o botão "Atualizar" fica na
 * barra de cima e nada interrompe a pessoa. Só atualiza sozinho quando ninguém
 * está usando: fora de chamada, com o Toca na bandeja ou minimizado e o PC
 * parado. Fechar o app de vez também instala (autoInstallOnAppQuit).
 */
export function useQuietUpdate(update: UpdateState, inCall: boolean, install: () => void) {
  const ready = update.status === "downloaded";
  const installRef = useRef(install);
  installRef.current = install;
  // Quando saiu da última chamada (0: em chamada agora)
  const leftCallAt = useRef(Date.now());

  useEffect(() => {
    leftCallAt.current = inCall ? 0 : Date.now();
  }, [inCall]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const look = async () => {
      const left = leftCallAt.current;
      if (!left || Date.now() - left < OUT_OF_CALL_MS) return;
      const [visible, idle] = await Promise.all([native.isWindowVisible(), native.getIdleSeconds()]);
      if (active && !visible && idle >= IDLE_S && leftCallAt.current) installRef.current();
    };
    const id = setInterval(() => void look(), POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [ready]);
}
