import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./Button";

/**
 * Janela por cima do app (design: .modal). Esc ou clique fora fecham; o foco
 * fica preso dentro e volta para onde estava ao fechar.
 */
export function Modal({
  title,
  description,
  wide,
  headerAction,
  footer,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Mais larga (ex.: seletor de tela) */
  wide?: boolean;
  /** Botão extra ao lado do fechar */
  headerAction?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Foco no primeiro campo; sem campo, na própria janela
    const first = ref.current?.querySelector<HTMLElement>("input, [role=radio][aria-checked=true], [role=tab][aria-selected=true]");
    (first ?? ref.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "Tab" && ref.current) {
        const items = [
          ...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [tabindex='0']"),
        ];
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="sheet-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`sheet ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
      >
        <div className="sheet-h">
          <div className="grow">
            <h2 id={`${id}-t`}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {headerAction}
          <IconButton size="sm" label="Fechar" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="sheet-b">{children}</div>
        {footer && <div className="sheet-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
