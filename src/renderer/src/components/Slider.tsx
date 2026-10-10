import { useId, type ReactNode } from "react";

/**
 * Controle deslizante com o visual do Toca (por baixo é um input range, então
 * setas, Page Up/Down, Home/End e leitores de tela funcionam normalmente).
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  hint,
  disabled,
  children,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Texto do valor (ex.: "120%") */
  format: (value: number) => string;
  onChange: (value: number) => void;
  hint?: ReactNode;
  disabled?: boolean;
  /** Fica entre o controle e a dica (ex.: medidor) */
  children?: ReactNode;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <label className="label" htmlFor={id}>
          {label}
        </label>
        <span className="xs muted num">{format(value)}</span>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
