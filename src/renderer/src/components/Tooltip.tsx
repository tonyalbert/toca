import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 450;
const GAP = 8;

/**
 * Dicas com o visual do Toca (o title nativo tem cara de navegador). Qualquer
 * elemento com data-tip="texto" ganha a dica: ao parar o mouse em cima por um
 * instante ou ao chegar nele pelo teclado. Montado uma vez, em main.tsx.
 * O texto é só visual: o elemento continua com seu aria-label.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; left: number; top: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      target.current = null;
      setTip(null);
    };
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      // Embaixo do elemento; se não couber, em cima
      const below = r.bottom + 40 < window.innerHeight;
      setTip({ text, left: r.left + r.width / 2, top: below ? r.bottom + GAP : r.top - GAP, below });
    };
    const tipTarget = (node: EventTarget | null) =>
      node instanceof Element ? (node.closest("[data-tip]") as HTMLElement | null) : null;

    const onOver = (e: PointerEvent) => {
      const el = tipTarget(e.target);
      if (el === target.current) return;
      hide();
      if (!el) return;
      target.current = el;
      timer.current = window.setTimeout(() => show(el), SHOW_DELAY_MS);
    };
    const onFocus = (e: FocusEvent) => {
      const el = tipTarget(e.target);
      // Só pelo teclado (clique também dá foco, mas aí a dica atrapalha)
      if (el && el.matches(":focus-visible")) {
        hide();
        target.current = el;
        show(el);
      }
    };
    const onBlur = (e: FocusEvent) => {
      if (tipTarget(e.target) === target.current) hide();
    };
    const onLeaveWindow = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onLeaveWindow);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onLeaveWindow);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Não deixa a dica sair pelas bordas da janela
  useEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, tip.left - w / 2));
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      className="tt"
      aria-hidden="true"
      style={{
        top: tip.below ? tip.top : undefined,
        bottom: tip.below ? undefined : window.innerHeight - tip.top,
        left: tip.left,
        visibility: "hidden",
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
