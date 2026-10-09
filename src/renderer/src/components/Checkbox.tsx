import { Check } from "lucide-react";

/** Caixa de marcar própria (a nativa segue o visual do sistema) */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Para leitores de tela, quando o texto visível está em outro lugar */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      className="chk"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        // Dentro de uma linha clicável, não dispara o clique da linha de novo
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      {checked && <Check size={13} strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}
