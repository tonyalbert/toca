import type { ReactNode } from "react";
import { TocaMark } from "./TocaMark";

/** Moldura das telas antes de entrar: arte à esquerda, formulário à direita */
export function AuthLayout({ version, children }: { version: string | null; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="row" style={{ gap: 12, position: "relative" }}>
          <TocaMark size={36} bg="var(--card-2)" />
          <strong className="h-display" style={{ fontSize: 20 }}>
            toca
          </strong>
        </div>
        <svg className="big-arch" viewBox="0 0 520 520" aria-hidden="true">
          <path className="ring" d="M20 520 V300 A240 240 0 0 1 500 300 V520" />
          <path className="ring" d="M80 520 V300 A180 180 0 0 1 440 300 V520" />
          <path className="ring" d="M140 520 V300 A120 120 0 0 1 380 300 V520" />
          <path className="glow" d="M170 520 V300 A90 90 0 0 1 350 300 V520 Z" />
          <path className="core" d="M200 520 V300 A60 60 0 0 1 320 300 V520 Z" />
        </svg>
        <h2>
          Entra, a turma <em>já tá na toca.</em>
        </h2>
        <span className="xs muted" style={{ position: "relative" }}>
          Toca é um app da Rabbit{version ? ` · v${version} beta` : " · beta"}
        </span>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  );
}

/** Título e subtítulo de cada passo */
export function AuthHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
