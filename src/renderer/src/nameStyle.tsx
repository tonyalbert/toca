import type { CSSProperties } from "react";

/** glow: brilho em volta · shine: reflexo passando · flow: o degradê anda */
export type NameEffect = "none" | "glow" | "shine" | "flow";

/** Estilo do nome: 1 cor (sólida) ou 2 a 3 (degradê), e um efeito */
export interface NameStyle {
  colors: string[];
  effect: NameEffect;
}

export const NAME_EFFECTS: { id: NameEffect; label: string }[] = [
  { id: "none", label: "Nenhum" },
  { id: "glow", label: "Brilho" },
  { id: "shine", label: "Reflexo" },
  { id: "flow", label: "Degradê andando" },
];

/** Fundo do cartão na call: 1 cor ou degradê de 2 ou 3 */
export interface CardStyle {
  colors: string[];
}

export const CARD_PRESETS: { label: string; colors: string[] }[] = [
  { label: "Pôr do sol", colors: ["#ff7a59", "#ff3d8b"] },
  { label: "Oceano", colors: ["#4facfe", "#00c6a7"] },
  { label: "Uva", colors: ["#7c5cff", "#c44dff"] },
  { label: "Floresta", colors: ["#1d976c", "#93f9b9"] },
  { label: "Fogo", colors: ["#f83600", "#f9d423"] },
  { label: "Noite", colors: ["#141e30", "#4a5f8a"] },
  { label: "Algodão-doce", colors: ["#fbc2eb", "#a6c1ee"] },
];

/** O degradê do fundo do cartão (null: o padrão do tema) */
export function cardBackground(style: CardStyle | null | undefined): string | null {
  if (!style?.colors.length) return null;
  const [a, b = a, c] = style.colors;
  return `linear-gradient(135deg, ${c ? `${a}, ${b}, ${c}` : `${a}, ${b}`})`;
}

/** Combinações prontas */
export const NAME_PRESETS: { label: string; style: NameStyle }[] = [
  { label: "Pôr do sol", style: { colors: ["#ff7a59", "#ff3d8b", "#ffb347"], effect: "flow" } },
  { label: "Neon", style: { colors: ["#21e6c1", "#7c5cff"], effect: "glow" } },
  { label: "Ouro", style: { colors: ["#f7d774", "#c8902e"], effect: "shine" } },
  { label: "Oceano", style: { colors: ["#4facfe", "#00f2fe"], effect: "flow" } },
  { label: "Arco-íris", style: { colors: ["#ff5f6d", "#ffc371", "#47e891"], effect: "flow" } },
  { label: "Brasa", style: { colors: ["#ff4b2b"], effect: "glow" } },
];

/** Classe e variáveis CSS do nome (sem estilo: nada, fica a cor do texto) */
export function nameStyleAttrs(style: NameStyle | null | undefined): { className: string; style?: CSSProperties } {
  if (!style || style.colors.length === 0) return { className: "nm" };
  const [a, b = a, c] = style.colors;
  const stops = c ? `${a}, ${b}, ${c}` : `${a}, ${b}`;
  // Andando: o degradê volta à primeira cor para emendar sem pulo
  const gradient = style.effect === "flow" ? `linear-gradient(90deg, ${stops}, ${a})` : `linear-gradient(90deg, ${stops})`;
  return {
    className: `nm styled fx-${style.effect}`,
    style: { "--nm-grad": gradient, "--nm-c1": a, "--nm-c2": b } as CSSProperties,
  };
}

/** O nome de alguém com a cor, o degradê e o efeito que a pessoa escolheu */
export function StyledName({ name, nameStyle, className }: { name: string; nameStyle?: NameStyle | null; className?: string }) {
  const attrs = nameStyleAttrs(nameStyle);
  return (
    <span className={className ? `${attrs.className} ${className}` : attrs.className} style={attrs.style} data-text={name}>
      {name}
    </span>
  );
}
