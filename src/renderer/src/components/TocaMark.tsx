/** O ícone do Toca (arco âmbar). O fundo usa --surface, a menos que bg seja passado. */
export function TocaMark({ size = 20, bg }: { size?: number; bg?: string }) {
  return (
    <svg className="tmark" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <rect className="bg" width="96" height="96" rx="22" style={bg ? { fill: bg } : undefined} />
      <path className="fg" d="M33 74 V45 A15 15 0 0 1 63 45 V74 Z" />
    </svg>
  );
}
