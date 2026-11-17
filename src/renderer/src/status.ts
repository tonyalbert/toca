import type { Presence } from "./components/Avatar";

/** Status que você escolhe (invisível: aparece offline para os amigos) */
export type UserStatus = "online" | "away" | "dnd" | "invisible";

export const STATUS_LABELS: Record<UserStatus, string> = {
  online: "Disponível",
  away: "Ausente",
  dnd: "Não perturbe",
  invisible: "Invisível",
};

export const STATUS_HINTS: Record<UserStatus, string> = {
  online: "Os amigos veem que você está on.",
  away: "Aparece que você saiu um pouco.",
  dnd: "Ninguém consegue te chamar e o Windows não mostra avisos.",
  invisible: "Você aparece offline, mas usa tudo normalmente.",
};

/** Bolinha no avatar de um amigo: em call ganha de tudo, depois o status */
export function presenceOf(p: { online: boolean; status?: UserStatus }, inCall = false): Presence {
  if (inCall) return "call";
  if (!p.online) return "offline";
  return p.status === "away" ? "away" : p.status === "dnd" ? "dnd" : "online";
}

/** Texto ao lado do @: o recado, ou o nome do status */
export function presenceText(p: { online: boolean; status?: UserStatus; statusText?: string | null }): string {
  if (!p.online) return "Offline";
  if (p.statusText) return p.statusText;
  return p.status === "away" || p.status === "dnd" ? STATUS_LABELS[p.status] : "Online";
}
