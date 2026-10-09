import { useCallback, useEffect, useState } from "react";
import type { ScreenSource } from "../../shared/screen";

/** Seletor de tela inteira ou janela, com opção de incluir o áudio do sistema */
export function ScreenSharePicker({
  onShare,
  onClose,
}: {
  onShare: (sourceId: string, withAudio: boolean) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ScreenSource["type"]>("screen");
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [withAudio, setWithAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSources(await window.toca.getScreenSources());
      setError(null);
    } catch (err) {
      setError(`Não foi possível listar as telas: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = sources?.filter((s) => s.type === tab) ?? [];
  const share = () => selected && onShare(selected, withAudio);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-labelledby="screen-picker-title">
        <header className="modal-header">
          <h2 id="screen-picker-title">Compartilhar tela</h2>
          <button className="link-button" onClick={() => void load()}>
            atualizar lista
          </button>
        </header>

        <div className="tabs" role="tablist">
          {(["screen", "window"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "screen" ? "Tela inteira" : "Janela"}
            </button>
          ))}
        </div>

        <div className="source-grid">
          {error && <div className="muted-text">{error}</div>}
          {!sources && !error && <div className="muted-text">Carregando…</div>}
          {sources && visible.length === 0 && <div className="muted-text">Nada para mostrar aqui.</div>}
          {visible.map((s) => (
            <button
              key={s.id}
              className={`source ${selected === s.id ? "selected" : ""}`}
              onClick={() => setSelected(s.id)}
              onDoubleClick={() => onShare(s.id, withAudio)}
              title={s.name}
            >
              <img className="source-thumb" src={s.thumbnail} alt="" />
              <span className="source-name">
                {s.icon && <img className="source-icon" src={s.icon} alt="" />}
                <span>{s.name}</span>
              </span>
            </button>
          ))}
        </div>

        {withAudio && (
          <div className="muted-text">
            Vai o som do computador (vídeos, músicas, jogos), sem as vozes da chamada: ninguém ouve o
            próprio eco.
          </div>
        )}

        <footer className="modal-footer">
          <label className="checkbox">
            <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} />
            Incluir o áudio do computador
          </label>
          <div className="modal-actions">
            <button className="secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" disabled={!selected} onClick={share}>
              Compartilhar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
