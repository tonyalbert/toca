import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { IconButton } from "./Button";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label: ReactNode;
  /** Ação ao lado do rótulo (ex.: "Esqueci a senha") */
  labelAction?: ReactNode;
  /** Texto de ajuda abaixo do campo (some quando há erro) */
  hint?: ReactNode;
  error?: string | null;
  /** Dentro do campo, à esquerda (ex.: "@") */
  prefix?: ReactNode;
}

/** Campo com rótulo, dica e erro. type="password" ganha o botão de mostrar a senha. */
export function Input({ label, labelAction, hint, error, prefix, type = "text", className, ...rest }: InputProps) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const note = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const cls = ["input", prefix != null && "has-pre", isPassword && "has-post", className].filter(Boolean).join(" ");

  return (
    <div className="field">
      {labelAction ? (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="label" htmlFor={id}>
            {label}
          </label>
          {labelAction}
        </div>
      ) : (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="in-wrap">
        {prefix != null && <span className="pre">{prefix}</span>}
        <input
          id={id}
          className={cls}
          type={isPassword && showPassword ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={note}
          {...rest}
        />
        {isPassword && (
          <IconButton
            size="sm"
            className="post"
            label={showPassword ? "Esconder a senha" : "Mostrar a senha"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </IconButton>
        )}
      </div>
      {error ? (
        <span className="err" id={note} role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </span>
      ) : (
        hint && (
          <span className="hint" id={note}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
