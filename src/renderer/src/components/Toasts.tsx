import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { Button, IconButton } from "./Button";

export interface ToastAction {
  label: string;
  primary?: boolean;
  /** Pode ser assíncrona; o aviso fecha depois */
  onClick: () => unknown;
}

export interface ToastOptions {
  title: string;
  sub?: string;
  /** Desenho à esquerda (bichinho, ícone da sala); sem isso, ícone pelo tipo */
  art?: ReactNode;
  kind?: "info" | "ok" | "error";
  actions?: ToastAction[];
  /** Milissegundos até sumir sozinho (avisos com ações ficam mais) */
  duration?: number;
}

type Show = (options: ToastOptions) => void;
const ToastContext = createContext<Show | null>(null);

/** Mostra um aviso no canto do app: const toast = useToast(); toast({ title: "…" }) */
export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast precisa do ToastProvider");
  return show;
}

const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<(ToastOptions & { id: number })[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<Show>(
    (options) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { ...options, id }].slice(-MAX_TOASTS));
      const duration = options.duration ?? (options.actions?.length ? 12000 : 5000);
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind ?? "info"}`} role={t.kind === "error" ? "alert" : "status"}>
              {t.art ??
                (t.kind === "error" ? (
                  <CircleAlert size={20} aria-hidden="true" className="toast-ico" />
                ) : (
                  <CircleCheck size={20} aria-hidden="true" className="toast-ico" />
                ))}
              <div className="grow">
                <strong>{t.title}</strong>
                {t.sub && <span className="sub">{t.sub}</span>}
                {t.actions && t.actions.length > 0 && (
                  <div className="acts">
                    {t.actions.map((a) => (
                      <Button
                        key={a.label}
                        size="sm"
                        variant={a.primary ? "primary" : "secondary"}
                        onClick={async () => {
                          dismiss(t.id);
                          await a.onClick();
                        }}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <IconButton size="sm" label="Fechar aviso" onClick={() => dismiss(t.id)}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
