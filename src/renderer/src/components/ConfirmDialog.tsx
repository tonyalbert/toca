import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  /** Texto do botão de confirmar (ex.: "Excluir sala") */
  confirmLabel: string;
  cancelLabel?: string;
  /** Ação que não dá para desfazer: botão vermelho */
  danger?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * Confirmações com o visual do Toca (nunca o confirm() do Windows).
 * Uso: const confirm = useConfirm(); if (await confirm({ ... })) { ... }
 */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm precisa do ConfirmProvider");
  return ask;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const ask = useCallback<Ask>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          current?.resolve(false); // só uma pergunta por vez
          return { options, resolve };
        });
      }),
    [],
  );

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && <ConfirmDialog options={pending.options} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (ok: boolean) => void }) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Foco no "Cancelar": Enter sem querer não exclui nada
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Captura na janela: o Esc fecha só esta pergunta, não o modal de baixo
        e.stopPropagation();
        e.preventDefault();
        onAnswer(false);
      } else if (e.key === "Tab") {
        // Mantém o foco dentro da pergunta
        const buttons = [...(dialogRef.current?.querySelectorAll("button") ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i + 1) % buttons.length;
        e.preventDefault();
        buttons[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onAnswer]);

  return createPortal(
    <div className="dialog-ov" onMouseDown={(e) => e.target === e.currentTarget && onAnswer(false)}>
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={options.message ? `${id}-m` : undefined}
      >
        <h2 id={`${id}-t`}>{options.title}</h2>
        {options.message && (
          <p id={`${id}-m`} className="muted">
            {options.message}
          </p>
        )}
        <div className="dialog-f">
          <Button ref={cancelRef} onClick={() => onAnswer(false)}>
            {options.cancelLabel ?? "Cancelar"}
          </Button>
          <Button variant={options.danger ? "danger" : "primary"} onClick={() => onAnswer(true)}>
            {options.confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
