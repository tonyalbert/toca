import { BookOpen, Film, Gamepad2, Moon, Music, Sofa, type LucideIcon } from "lucide-react";
import type { RoomIcon as RoomIconKind } from "../api";

const ICONS: Record<RoomIconKind, LucideIcon> = {
  sofa: Sofa,
  game: Gamepad2,
  film: Film,
  music: Music,
  book: BookOpen,
  moon: Moon,
};

export const ROOM_ICON_LABELS: Record<RoomIconKind, string> = {
  sofa: "Sofá",
  game: "Jogo",
  film: "Filme",
  music: "Música",
  book: "Estudos",
  moon: "Noite",
};

export function RoomIcon({ icon, size = 16 }: { icon: RoomIconKind; size?: number }) {
  const Icon = ICONS[icon] ?? Sofa;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}
