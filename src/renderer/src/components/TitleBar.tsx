import { useEffect, useState } from "react";
import { Copy, Download, Gift, Minus, MonitorDown, Square, X } from "lucide-react";
import type { UpdateState } from "../../../shared/update";
import { TocaMark } from "./TocaMark";
import { DOWNLOAD_URL, features, native } from "../platform";

/**
 * Barra de título própria (a janela não tem moldura). Arrastar por ela move a
 * janela; clique duplo maximiza (o Windows faz isso nas áreas de arrastar).
 * No navegador: sem os botões da janela e sem "verificar atualizações"; no
 * lugar, o link para baixar o app.
 */
export function TitleBar({
  update,
  onInstall,
  newsUnseen,
  onNews,
}: {
  update: UpdateState;
  onInstall: () => void;
  /** Atualizou e ainda não viu as novidades */
  newsUnseen: boolean;
  onNews: () => void;
}) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!features.windowControls) return;
    void native.isWindowMaximized().then(setMaximized);
    return native.onWindowMaximized(setMaximized);
  }, []);

  return (
    <header className={features.windowControls ? "titlebar" : "titlebar web"}>
      <TocaMark size={20} />
      <span>Toca</span>
      <span className="spacer" />
      <button
        className={`upd-pill news-pill ${newsUnseen ? "unseen" : ""}`}
        onClick={onNews}
        data-tip={newsUnseen ? "O Toca foi atualizado: veja o que mudou" : "O que mudou em cada versão"}
      >
        <Gift size={13} aria-hidden="true" />
        Novidades
        {newsUnseen && <span className="news-dot" aria-label="(novo)" />}
      </button>
      {!features.autoUpdate && (
        <a className="upd-pill subtle" href={DOWNLOAD_URL} target="_blank" rel="noreferrer" data-tip="Atalhos com o jogo aberto, som do PC na tela e mais">
          <MonitorDown size={13} aria-hidden="true" />
          Baixar app para Windows
        </a>
      )}
      {features.autoUpdate && (update.status === "idle" || update.status === "up-to-date" || update.status === "error") && (
        <button
          className="upd-pill"
          onClick={() => void native.checkForUpdates()}
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
      {features.windowControls && <div className="wc-group">
        <button className="wc" aria-label="Minimizar" data-tip="Minimizar" onClick={() => void native.minimizeWindow()}>
          <Minus size={15} aria-hidden="true" />
        </button>
        <button
          className="wc"
          aria-label={maximized ? "Restaurar" : "Maximizar"}
          data-tip={maximized ? "Restaurar" : "Maximizar"}
          onClick={() => void native.toggleMaximizeWindow()}
        >
          {maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
        </button>
        <button
          className="wc close"
          aria-label="Fechar"
          data-tip="Fechar (o Toca continua na bandeja)"
          onClick={() => void native.closeWindow()}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>}
    </header>
  );
}
