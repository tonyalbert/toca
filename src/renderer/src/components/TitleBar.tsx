import { useEffect, useState } from "react";
import { Copy, Download, Minus, Square, X } from "lucide-react";
import type { UpdateState } from "../../../shared/update";
import { TocaMark } from "./TocaMark";

/**
 * Barra de título própria (a janela não tem moldura). Arrastar por ela move a
 * janela; clique duplo maximiza (o Windows faz isso nas áreas de arrastar).
 */
export function TitleBar({ update, onInstall }: { update: UpdateState; onInstall: () => void }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.toca.isWindowMaximized().then(setMaximized);
    return window.toca.onWindowMaximized(setMaximized);
  }, []);

  return (
    <header className="titlebar">
      <TocaMark size={20} />
      <span>Toca</span>
      <span className="spacer" />
      {(update.status === "idle" || update.status === "up-to-date" || update.status === "error") && (
        <button
          className="upd-pill"
          onClick={() => void window.toca.checkForUpdates()}
          title={update.status === "error" ? update.message : undefined}
          data-tip={update.status === "error" ? "Falha ao atualizar. Clique para tentar novamente." : "Verificar atualizações"}
        >
          {update.status === "error" ? "Falha na atualização · Tentar novamente" : update.status === "up-to-date" ? "Toca atualizado · Verificar" : "Verificar atualizações"}
        </button>
      )}
      {update.status === "checking" && (
        <span className="xs muted" role="status">Verificando atualizações…</span>
      )}
      {update.status === "downloading" && (
        <span className="xs muted num" role="status">
          Baixando a versão {update.version}… {update.percent}%
        </span>
      )}
      {update.status === "downloaded" && (
        <button
          className="upd-pill"
          onClick={onInstall}
          data-tip={`Versão ${update.version} pronta. O app reinicia em segundos e você volta para a mesma sala.`}
        >
          <Download size={14} aria-hidden="true" />
          Atualizar
        </button>
      )}
      <div className="wc-group">
        <button className="wc" aria-label="Minimizar" data-tip="Minimizar" onClick={() => void window.toca.minimizeWindow()}>
          <Minus size={15} aria-hidden="true" />
        </button>
        <button
          className="wc"
          aria-label={maximized ? "Restaurar" : "Maximizar"}
          data-tip={maximized ? "Restaurar" : "Maximizar"}
          onClick={() => void window.toca.toggleMaximizeWindow()}
        >
          {maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
        </button>
        <button
          className="wc close"
          aria-label="Fechar"
          data-tip="Fechar (o Toca continua na bandeja)"
          onClick={() => void window.toca.closeWindow()}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
