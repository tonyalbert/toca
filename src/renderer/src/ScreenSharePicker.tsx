import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Monitor, RefreshCw, ScreenShare } from "lucide-react";
import type { ScreenSource } from "../../shared/screen";
import { Button, IconButton } from "./components/Button";
import { Modal } from "./components/Modal";
import { Select } from "./components/Select";
import { Switch } from "./components/Switch";
import { native } from "./platform";
import { SCREEN_QUALITIES, getScreenQuality, setScreenQuality, type ScreenQuality } from "./screenQuality";

/** Seletor de tela inteira ou janela, com opção de incluir o áudio do computador */
export function ScreenSharePicker({
  onShare,
  onClose,
}: {
  onShare: (sourceId: string, withAudio: boolean, quality: ScreenQuality, sourceName: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ScreenSource["type"]>("screen");
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [withAudio, setWithAudio] = useState(false);
  const [quality, setQuality] = useState(getScreenQuality);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await native.getScreenSources();
      setSources(list);
      setError(null);
      // Com uma tela só, ela já vem escolhida
      const screens = list.filter((x) => x.type === "screen");
      setSelected((s) => s ?? (screens.length === 1 ? screens[0].id : null));
    } catch (err) {
      setError(`Não foi possível listar as telas: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = sources?.filter((s) => s.type === tab) ?? [];
  const chosen = sources?.find((s) => s.id === selected);
  const share = (source = chosen) => {
    if (!source) return;
    setScreenQuality(quality);
    onShare(source.id, withAudio, quality, sourceLabel(source));
  };

  // Setas andam entre as miniaturas (grupo de opções), Enter compartilha
  const onGridKey = (e: KeyboardEvent) => {
    if (visible.length === 0) return;
    const cols = 3;
    const i = Math.max(0, visible.findIndex((s) => s.id === selected));
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[e.key];
    if (step !== undefined) {
      e.preventDefault();
      const next = visible[Math.max(0, Math.min(visible.length - 1, i + step))];
      setSelected(next.id);
      gridRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)?.focus();
    } else if (e.key === "Enter" && chosen) {
      e.preventDefault();
      share();
    }
  };

  return (
    <Modal
      wide
      title="Compartilhar tela"
      description="Escolha o que a turma vai ver."
      onClose={onClose}
      headerAction={
        <IconButton size="sm" label="Atualizar a lista" onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden="true" />
        </IconButton>
      }
      footer={
        <>
          <span className="grow" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            icon={<ScreenShare size={15} aria-hidden="true" />}
            disabled={!chosen}
            onClick={() => share()}
          >
            Compartilhar
          </Button>
        </>
      }
    >
      <div className="tabs" role="tablist" aria-label="Tipo de compartilhamento" style={{ alignSelf: "flex-start" }}>
        {(["screen", "window"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "screen" ? "Tela inteira" : "Janela"}
          </button>
        ))}
      </div>

      {error && <div className="notice error">{error}</div>}
      {!sources && !error && <p className="sm muted">Carregando…</p>}
      {sources && visible.length === 0 && (
        <p className="sm muted">{tab === "screen" ? "Nenhuma tela encontrada." : "Nenhuma janela aberta para compartilhar."}</p>
      )}

      {visible.length > 0 && (
        <div ref={gridRef} className="thumbs" role="radiogroup" aria-label="O que compartilhar" onKeyDown={onGridKey}>
          {visible.map((s, i) => {
            const isSel = s.id === selected;
            // Só um item entra no Tab: o escolhido (ou o primeiro)
            const focusable = isSel || (!visible.some((v) => v.id === selected) && i === 0);
            return (
              <button
                key={s.id}
                data-id={s.id}
                className="thumb"
                role="radio"
                aria-checked={isSel}
                tabIndex={focusable ? 0 : -1}
                data-tip={s.name}
                onClick={() => setSelected(s.id)}
                onDoubleClick={() => share(s)}
              >
                <span className="pv">
                  <img src={s.thumbnail} alt="" />
                </span>
                <span>
                  {s.icon ? <img className="src-icon" src={s.icon} alt="" /> : <Monitor size={14} aria-hidden="true" />}
                  <span className="src-name">{sourceLabel(s)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <Select
          label="Qualidade"
          value={quality}
          options={SCREEN_QUALITIES}
          onChange={setQuality}
          hint="Quanto menor, menos o compartilhamento pesa no seu PC e na sua internet."
        />
        <Switch
          checked={withAudio}
          onChange={setWithAudio}
          label="Compartilhar o áudio do PC"
          description="A turma ouve o som do vídeo ou do jogo junto com a tela. As vozes da chamada não vão junto, então ninguém ouve o próprio eco."
        />
      </div>
    </Modal>
  );
}

/** "Entire screen"/"Screen 1" do Windows vira "Tela inteira"/"Tela 1" */
function sourceLabel(s: ScreenSource): string {
  if (s.type === "window") return s.name;
  if (/^entire screen$/i.test(s.name)) return "Tela inteira";
  const n = s.name.match(/^screen (\d+)$/i);
  return n ? `Tela ${n[1]}` : s.name;
}
