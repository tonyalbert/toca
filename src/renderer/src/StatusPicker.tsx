import { useEffect, useRef, useState } from "react";
import { Check, UserRound } from "lucide-react";
import { setMyStatus, type Account } from "./api";
import { Avatar } from "./components/Avatar";
import { Button } from "./components/Button";
import { useToast } from "./components/Toasts";
import { STATUS_HINTS, STATUS_LABELS, type UserStatus } from "./status";

const ORDER: UserStatus[] = ["online", "away", "dnd", "invisible"];
const DOT: Record<UserStatus, "online" | "away" | "dnd" | "offline"> = { online: "online", away: "away", dnd: "dnd", invisible: "offline" };

/** Janelinha acima do seu nome: status, recado e o caminho para a conta */
export function StatusPicker({
  me,
  onChange,
  onProfile,
  onClose,
}: {
  me: Account;
  onChange: (me: Account) => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const current = me.status ?? "online";
  const [text, setText] = useState(me.statusText ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".me-id")) onClose();
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
  }, [onClose]);

  const save = async (changes: { status?: UserStatus; statusText?: string | null }) => {
    setBusy(true);
    try {
      onChange(await setMyStatus(changes));
    } catch (err) {
      toast({ kind: "error", title: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const textChanged = text.trim() !== (me.statusText ?? "");

  return (
    <div ref={ref} className="status-pop" role="dialog" aria-label="Seu status">
      <div role="radiogroup" aria-label="Status" className="status-opts">
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={current === s}
            disabled={busy}
            onClick={() => void save({ status: s })}
          >
            <span className={`status-dot ${DOT[s]}`} aria-hidden="true" />
            <span className="grow">
              <strong>{STATUS_LABELS[s]}</strong>
              <span>{STATUS_HINTS[s]}</span>
            </span>
            {current === s && <Check size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <form
        className="status-text"
        onSubmit={(e) => {
          e.preventDefault();
          if (textChanged) void save({ statusText: text.trim() || null });
        }}
      >
        <label className="xs muted" htmlFor="status-text">
          Recado
        </label>
        <div className="row" style={{ gap: 6 }}>
          <input
            id="status-text"
            className="input"
            maxLength={80}
            placeholder="Jogando, volto já, estudando…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {textChanged ? (
            <Button size="sm" variant="primary" type="submit" disabled={busy}>
              Salvar
            </Button>
          ) : (
            me.statusText && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => (setText(""), void save({ statusText: null }))}>
                Tirar
              </Button>
            )
          )}
        </div>
      </form>
      <button type="button" className="status-account" onClick={() => (onClose(), onProfile())}>
        <Avatar kind={me.avatar} photo={me.photo} size={22} />
        <span className="grow">Minha conta</span>
        <UserRound size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
