import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Lista de escolha com o visual do Toca (a lista do <select> nativo é desenhada
 * pelo Windows e não aceita estilo). Teclado: setas, Home/End, Enter/Espaço
 * para escolher, Esc para fechar e letras para pular até a opção.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options.find((o) => o.value === value);

  // Abre embaixo do campo; se não couber, em cima
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const wanted = Math.min(280, options.length * 40 + 12);
    setPos(
      below >= wanted || below >= above
        ? { left: r.left, width: r.width, top: r.bottom + 6, maxHeight: Math.min(280, below) }
        : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(280, above) },
    );
  }, [open, options.length]);

  // Fecha ao clicar fora, rolar a página ou redimensionar a janela
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Mantém a opção ativa visível
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active, pos]);

  const show = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (i: number) => {
    const option = options[i];
    if (option && option.value !== value) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const last = options.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      if (!open) show();
      setActive(Math.max(0, Math.min(last, i)));
    };
    switch (e.key) {
      case "ArrowDown":
        return open ? move(active + 1) : move(selectedIndex);
      case "ArrowUp":
        return open ? move(active - 1) : move(selectedIndex);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "Enter":
      case " ":
        e.preventDefault();
        return open ? choose(active) : show();
      case "Escape":
      case "Tab":
        if (open) {
          if (e.key === "Escape") e.preventDefault();
          // Não deixa o Esc fechar também o modal em volta
          e.stopPropagation();
          setOpen(false);
        }
        return;
      default:
        // Digitar letras pula para a opção que começa com elas
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          const now = Date.now();
          typed.current.text = (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase();
          typed.current.at = now;
          const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
          if (i >= 0) move(i);
        }
    }
  };

  const listId = `${id}-list`;
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`input select-btn ${open ? "is-open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{selected?.label ?? ""}</span>
        <ChevronDown size={16} className="chev" aria-hidden="true" />
      </button>
      {hint && <span className="hint">{hint}</span>}
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            className="select-list"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                className={i === active ? "is-active" : undefined}
                onMouseEnter={() => setActive(i)}
                // mousedown: escolhe antes do botão perder o foco
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(i);
                }}
              >
                <span className="select-label">{o.label}</span>
                {o.value === value && <Check size={15} aria-hidden="true" />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
