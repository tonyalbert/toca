import { useState } from "react";
import { Check, CircleAlert, Plus, X } from "lucide-react";
import { updateProfile, type Account } from "./api";
import { Avatar } from "./components/Avatar";
import { Button, IconButton } from "./components/Button";
import { cardBackground, CARD_PRESETS, StyledName, type CardStyle } from "./nameStyle";

const same = (a: CardStyle | null | undefined, b: CardStyle | null) => JSON.stringify(a ?? null) === JSON.stringify(b);

/** O fundo do seu cartão na chamada (quando a câmera está desligada) */
export function CardStyleEditor({ me, onSaved }: { me: Account; onSaved: (me: Account) => void }) {
  const initial = me.cardStyle ?? null;
  const [on, setOn] = useState(!!initial);
  const [colors, setColors] = useState<string[]>(initial?.colors.length ? initial.colors : ["#7c5cff", "#c44dff"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const draft: CardStyle | null = on ? { colors } : null;
  const changed = !same(initial, draft);
  const bg = cardBackground(draft);

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      onSaved(await updateProfile({ cardStyle: draft }));
      setResult({ ok: true, text: draft ? "Fundo salvo. A turma já vê na chamada." : "Seu cartão voltou ao padrão." });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div>
        <strong>Fundo do cartão na chamada</strong>
        <p className="xs muted">Aparece atrás do seu bichinho (ou da foto) quando a câmera está desligada.</p>
      </div>

      <div className="row" style={{ gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
        <div className={`pc grid cs-preview ${bg ? "has-bg" : ""}`} style={bg ? ({ "--pc-bg": bg } as React.CSSProperties) : undefined} aria-label="Prévia do seu cartão">
          <Avatar kind={me.avatar} photo={me.photo} size={64} mine />
          <span className="pc-text">
            <span className="name">
              <StyledName name={me.displayName ?? "Você"} nameStyle={me.nameStyle} />
            </span>
          </span>
        </div>

        <div className="col grow" style={{ gap: 10, minWidth: 220 }}>
          <div className="ns-presets">
            <button type="button" className="ns-chip" aria-pressed={!on} onClick={() => (setOn(false), setResult(null))}>
              Padrão
            </button>
            {CARD_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="ns-chip cs-chip"
                aria-pressed={on && JSON.stringify(colors) === JSON.stringify(p.colors)}
                style={{ "--chip-bg": cardBackground({ colors: p.colors }) } as React.CSSProperties}
                onClick={() => (setOn(true), setColors(p.colors), setResult(null))}
              >
                {p.label}
              </button>
            ))}
          </div>
          {on && (
            <div className="ns-colors">
              {colors.map((c, i) => (
                <label key={i} className="ns-color" style={{ background: c }} title={`Cor ${i + 1}: ${c}`}>
                  <input type="color" value={c} aria-label={`Cor ${i + 1}`} onChange={(e) => setColors((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
              {colors.length < 3 && (
                <IconButton size="sm" label="Mais uma cor" onClick={() => setColors((l) => [...l, "#ffc371"])}>
                  <Plus size={16} aria-hidden="true" />
                </IconButton>
              )}
              {colors.length > 1 && (
                <IconButton size="sm" label="Tirar a última cor" onClick={() => setColors((l) => l.slice(0, -1))}>
                  <X size={16} aria-hidden="true" />
                </IconButton>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <Button variant="primary" disabled={busy || !changed} onClick={() => void save()}>
          {busy ? "Salvando…" : "Salvar fundo"}
        </Button>
        {result && (
          <span className={`notice ${result.ok ? "ok" : "error"}`} role={result.ok ? "status" : "alert"}>
            {result.ok ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
            {result.text}
          </span>
        )}
      </div>
    </div>
  );
}
