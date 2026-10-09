import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

const VARIANTS = {
  primary: "btn-p",
  secondary: "btn-s",
  ghost: "btn-g",
  danger: "btn-d",
  "danger-soft": "btn-dg",
} as const;

const SIZES = { sm: "btn-sm", md: "", lg: "btn-lg" } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  /** primary (âmbar) só para a ação principal da tela */
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Ocupa a largura toda */
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  block,
  icon,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const cls = ["btn", VARIANTS[variant], SIZES[size], block && "btn-block", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Texto para leitores de tela e dica ao passar o mouse */
  label: string;
  size?: "sm" | "md";
  solid?: boolean;
}

/** Botão só com ícone (36 px; 30 px no tamanho pequeno) */
export function IconButton({ label, size = "md", solid, className, type = "button", children, ...rest }: IconButtonProps) {
  const cls = ["ib", size === "sm" && "ib-sm", solid && "solid", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} aria-label={label} data-tip={label} {...rest}>
      {children}
    </button>
  );
}
