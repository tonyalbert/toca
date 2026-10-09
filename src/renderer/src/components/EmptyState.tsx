import type { ReactNode } from "react";

/** Desenhos dos estados vazios (do design): a porta da toca, uma toca nova e dois amigos */
const ARTS = {
  door: (
    <>
      <path className="a4" d="M10 118 V70 A60 60 0 0 1 130 70 V118" />
      <path className="a1" d="M40 118 V74 A30 30 0 0 1 100 74 V118 Z" />
      <circle className="a2" cx="70" cy="96" r="7" />
    </>
  ),
  burrow: (
    <>
      <path className="a4" d="M10 118 V70 A60 60 0 0 1 130 70 V118" />
      <path className="a2" d="M40 118 V74 A30 30 0 0 1 100 74 V118 Z" />
      <path className="a3" d="M58 118 V88 A12 12 0 0 1 82 88 V118 Z" />
    </>
  ),
  friends: (
    <>
      <circle className="a1" cx="52" cy="70" r="26" />
      <rect className="a1" x="38" y="22" width="10" height="30" rx="5" transform="rotate(-8 43 52)" />
      <rect className="a1" x="56" y="22" width="10" height="30" rx="5" transform="rotate(8 61 52)" />
      <circle className="a4" cx="96" cy="74" r="22" />
      <path d="M96 64 v20 M86 74 h20" style={{ stroke: "var(--accent)", strokeWidth: 4, strokeLinecap: "round" }} />
    </>
  ),
};

export function EmptyState({
  art,
  title,
  children,
  actions,
}: {
  art: keyof typeof ARTS;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      <svg className="art" viewBox="0 0 140 120" aria-hidden="true">
        {ARTS[art]}
      </svg>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && (
        <div className="row" style={{ marginTop: 6 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
