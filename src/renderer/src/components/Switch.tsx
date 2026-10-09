import { useId, type ReactNode } from "react";

/** Liga/desliga (design: .switch). O texto ao lado também alterna ao clicar. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="grow" onClick={() => !disabled && onChange(!checked)}>
        <strong className="sm" id={`${id}-l`}>
          {label}
        </strong>
        {description && (
          <p className="xs muted" id={`${id}-d`}>
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}
