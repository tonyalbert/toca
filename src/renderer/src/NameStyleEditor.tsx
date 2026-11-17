import { useState } from "react";
import { Check, CircleAlert, Plus, X } from "lucide-react";
import { updateProfile, type Account } from "./api";
import { Button, IconButton } from "./components/Button";
import { NAME_EFFECTS, NAME_PRESETS, StyledName, type NameEffect, type NameStyle } from "./nameStyle";

type Mode = "default" | "solid" | "gradient";

const sameStyle = (a: NameStyle | null | undefined, b: NameStyle | null) => JSON.stringify(a ?? null) === JSON.stringify(b);

/** Cor, degradê e efeito do seu nome, com a prévia ao vivo */
export function NameStyleEditor({ me, onSaved }: { me: Account; onSaved: (me: Account) => void }) {
  const initial = me.nameStyle ?? null;
  const [mode, setMode] = useState<Mode>(!initial ? "default" : initial.colors.length > 1 ? "gradient" : "solid");
  const [colors, setColors] = useState<string[]>(initial?.colors.length ? initial.colors : ["#ff3d8b", "#7c5cff"]);
  const [effect, setEffect] = useState<NameEffect>(initial?.effect ?? "none");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // O que está na tela agora (sólida usa só a primeira cor; degradê, 2 ou 3)
  const used = mode === "solid" ? colors.slice(0, 1) : colors.length >= 2 ? colors.slice(0, 3) : [colors[0], colors[0]];
  // Degradê andando com uma cor só não anda
  const fx = mode === "solid" && effect === "flow" ? "none" : effect;
  const draft: NameStyle | null = mode === "default" ? null : { colors: used, effect: fx };
  const changed = !sameStyle(initial, draft);

  const setColor = (i: number, value: string) => setColors((list) => list.map((c, j) => (j === i ? value : c)));

  const pick = (style: NameStyle) => {
    setMode(style.colors.length > 1 ? "gradient" : "solid");
    setColors(style.colors.length > 1 ? style.colors : [style.colors[0], colors[1] ?? style.colors[0]]);
    setEffect(style.effect);
    setResult(null);
  };

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      onSaved(await updateProfile({ nameStyle: draft }));
      setResult({ ok: true, text: draft ? "Estilo salvo. Os amigos já veem o seu nome assim." : "Seu nome voltou para a cor padrão." });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <div>
          <strong>Estilo do nome</strong>
          <p className="xs muted">Como seu nome aparece para todo mundo: na chamada, no chat e na lista de amigos.</p>
        </div>
      </div>

      <div className="ns-preview" aria-label="Prévia do seu nome">
        <StyledName name={me.displayName ?? "Seu nome"} nameStyle={draft} />
      </div>

      <div className="col" style={{ gap: 6 }}>
        <span className="xs muted">Prontos</span>
        <div className="ns-presets">
          {NAME_PRESETS.map((p) => (
            <button key={p.label} type="button" className="ns-chip" aria-pressed={sameStyle(draft, p.style)} onClick={() => pick(p.style)}>
              <StyledName name={p.label} nameStyle={p.style} />
            </button>
          ))}
        </div>
      </div>

      <div className="col" style={{ gap: 6 }}>
        <span className="xs muted">Cor</span>
        <div className="tabs" role="radiogroup" aria-label="Tipo de cor" style={{ alignSelf: "flex-start" }}>
          {(
            [
              ["default", "Padrão"],
              ["solid", "Uma cor"],
              ["gradient", "Degradê"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} aria-selected={mode === id} onClick={() => (setMode(id), setResult(null))}>
              {label}
            </button>
          ))}
        </div>
        {mode !== "default" && (
          <div className="ns-colors">
            {(mode === "solid" ? colors.slice(0, 1) : colors).map((c, i) => (
              <label key={i} className="ns-color" style={{ background: c }} title={`Cor ${i + 1}: ${c}`}>
                <input type="color" value={c} aria-label={`Cor ${i + 1}`} onChange={(e) => setColor(i, e.target.value)} />
              </label>
            ))}
            {mode === "gradient" && colors.length < 3 && (
              <IconButton size="sm" label="Mais uma cor" onClick={() => setColors((list) => [...list, "#ffc371"])}>
                <Plus size={16} aria-hidden="true" />
              </IconButton>
            )}
            {mode === "gradient" && colors.length > 2 && (
              <IconButton size="sm" label="Tirar a última cor" onClick={() => setColors((list) => list.slice(0, 2))}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {mode !== "default" && (
        <div className="col" style={{ gap: 6 }}>
          <span className="xs muted">Efeito</span>
          <div className="ns-presets" role="radiogroup" aria-label="Efeito">
            {NAME_EFFECTS.filter((e) => mode === "gradient" || e.id !== "flow").map((e) => (
              <button key={e.id} type="button" role="radio" className="ns-chip" aria-checked={fx === e.id} aria-pressed={fx === e.id} onClick={() => (setEffect(e.id), setResult(null))}>
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 12 }}>
        <Button variant="primary" disabled={busy || !changed} onClick={() => void save()}>
          {busy ? "Salvando…" : "Salvar estilo"}
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
