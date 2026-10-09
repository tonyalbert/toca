import { useEffect, useRef, useState } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { IconButton } from "./Button";

/**
 * Botão que abre um controle de volume (0% a max). Mostra o valor quando não
 * está em 100%. Usado no cartão de cada pessoa e no som da tela compartilhada.
 */
export function VolumeControl({
  name,
  title,
  className,
  volume,
  max,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  onChange,
}: {
  /** Ex.: "Bia" vira "Volume de Bia" */
  name: string;
  /** Título no lugar de "Volume de {name}" */
  title?: string;
  className?: string;
  volume: number;
  max: number;
  /** Controlado de fora (ex.: o cartão abre com o clique direito); sem isso, controla sozinho */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onChange: (volume: number) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const onOpenChange = onOpenChangeProp ?? setOpenState;
  const ref = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const percent = Math.round(volume * 100);
  const heading = title ?? `Volume de ${name}`;
  const changed = percent !== 100;

  useEffect(() => {
    if (!open) return;
    sliderRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const Icon = percent === 0 ? VolumeX : percent < 100 ? Volume1 : Volume2;
  return (
    <div ref={ref} className={`vol ${className ?? ""} ${changed || open ? "is-set" : ""}`}>
      <IconButton
        size="sm"
        label={`${heading}: ${percent}%`}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Icon size={16} aria-hidden="true" />
        {changed && <span className="vol-pct num">{percent}%</span>}
      </IconButton>
      {open && (
        <div className="vol-pop" role="dialog" aria-label={heading}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong className="sm">{heading}</strong>
            <span className="xs muted num">{percent}%</span>
          </div>
          <input
            ref={sliderRef}
            className="range"
            type="range"
            min={0}
            max={max * 100}
            step={5}
            value={percent}
            aria-label={heading}
            aria-valuetext={`${percent}%`}
            onChange={(e) => onChange(Number(e.target.value) / 100)}
          />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="xs muted">Só você ouve assim.</span>
            <button type="button" className="link" disabled={!changed} onClick={() => onChange(1)}>
              Voltar a 100%
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
