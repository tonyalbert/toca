import { useEffect, useRef, useState, type ReactNode } from "react";
import { Music2, Plus, SmilePlus, Trash2, Upload } from "lucide-react";
import { REACTIONS, MAX_SOUND_SECONDS, type Fun } from "./fun";
import { getSoundboardVolume, setSoundboardVolume } from "./soundboard";
import { Button, IconButton } from "./components/Button";
import { useToast } from "./components/Toasts";

/** Janelinha que abre acima do botão da barra da chamada */
function Popover({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element;
      if (!ref.current?.contains(el) && !el.closest?.(".fun-trigger")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className="fun-pop" role="dialog" aria-label={label}>
      {children}
    </div>
  );
}

/** Botões de reação e soundboard que entram na barra da chamada */
export function FunControls({ fun, disabled, canManage }: { fun: Fun; disabled: boolean; canManage: boolean }) {
  const [open, setOpen] = useState<"react" | "sound" | null>(null);
  const close = () => setOpen(null);
  return (
    <span className="fun-wrap">
      <button
        type="button"
        className={`cb fun-trigger ${open === "react" ? "on" : ""}`}
        aria-label="Reagir"
        data-tip={open ? undefined : "Reagir"}
        aria-expanded={open === "react"}
        disabled={disabled}
        onClick={() => setOpen((o) => (o === "react" ? null : "react"))}
      >
        <SmilePlus aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`cb fun-trigger ${open === "sound" ? "on" : ""}`}
        aria-label="Soundboard"
        data-tip={open ? undefined : "Soundboard: sons para a sala"}
        aria-expanded={open === "sound"}
        disabled={disabled}
        onClick={() => setOpen((o) => (o === "sound" ? null : "sound"))}
      >
        <Music2 aria-hidden="true" />
      </button>
      <Popover open={open === "react"} onClose={close} label="Reagir">
        <div className="fun-reacts">
          {REACTIONS.map((e) => (
            <button key={e} type="button" className="fun-react" aria-label={`Reagir com ${e}`} onClick={() => fun.react(e)}>
              {e}
            </button>
          ))}
        </div>
      </Popover>
      <Popover open={open === "sound"} onClose={close} label="Soundboard">
        <Soundboard fun={fun} canManage={canManage} />
      </Popover>
    </span>
  );
}

function Soundboard({ fun, canManage }: { fun: Fun; canManage: boolean }) {
  const toast = useToast();
  const [volume, setVolume] = useState(getSoundboardVolume);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const play = (ref: string, label: string) => {
    if (!fun.play(ref, label)) toast({ title: "Calma: um som de cada vez", duration: 1500 });
  };

  const upload = async () => {
    if (!file || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await fun.upload(file, name, emoji);
      setAdding(false);
      setFile(null);
      setName("");
      setEmoji("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sb">
      <div className="sb-grid">
        {fun.builtins.map((s) => (
          <button key={s.id} type="button" className="sb-btn" onClick={() => play(`b:${s.id}`, s.name)}>
            <span aria-hidden="true">{s.emoji}</span>
            {s.name}
          </button>
        ))}
      </div>

      <div className="sb-h">
        <span className="xs muted">Da sala · {fun.sounds.length}</span>
        {!adding && (
          <Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Subir som
          </Button>
        )}
      </div>
      {fun.sounds.length > 0 && (
        <div className="sb-grid">
          {fun.sounds.map((s) => (
            <span key={s.id} className="sb-own">
              <button type="button" className="sb-btn" onClick={() => play(`r:${s.id}`, s.name)} title={s.createdBy ? `Subido por ${s.createdBy.displayName}` : undefined}>
                <span aria-hidden="true">{s.emoji ?? "🔊"}</span>
                {s.name}
              </button>
              {(canManage || s.createdBy?.id === fun.me) && (
                <IconButton
                  size="sm"
                  className="sb-del"
                  label={`Apagar ${s.name}`}
                  onClick={() => void fun.remove(s.id).catch((err: Error) => toast({ kind: "error", title: err.message }))}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </IconButton>
              )}
            </span>
          ))}
        </div>
      )}

      {adding && (
        <form
          className="sb-add"
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.ogg,.wav,.m4a"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 24));
              setError(null);
            }}
          />
          <Button size="sm" icon={<Upload size={14} aria-hidden="true" />} onClick={() => fileRef.current?.click()}>
            {file ? file.name.slice(0, 22) : `Escolher áudio (até ${MAX_SOUND_SECONDS} s)`}
          </Button>
          <div className="row" style={{ gap: 6 }}>
            <input className="input sb-emoji" value={emoji} maxLength={4} placeholder="🔊" aria-label="Emoji" onChange={(e) => setEmoji(e.target.value)} />
            <input className="input grow" value={name} maxLength={24} placeholder="Nome do som" aria-label="Nome do som" onChange={(e) => setName(e.target.value)} />
          </div>
          {error && <p className="xs sb-err">{error}</p>}
          <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
            <Button size="sm" variant="ghost" onClick={() => (setAdding(false), setError(null))}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy || !file || !name.trim()}>
              {busy ? "Subindo…" : "Subir"}
            </Button>
          </div>
        </form>
      )}

      <label className="sb-vol">
        <span className="xs muted">Volume dos sons (só para você)</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            setSoundboardVolume(v);
          }}
        />
      </label>
    </div>
  );
}
