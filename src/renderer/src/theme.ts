import { useEffect, useState } from "react";

/** Preferência de tema. "system" segue o modo claro/escuro do Windows. */
export type ThemePreference = "dark" | "light" | "system";

/** Cor do app (destaque e tom dos fundos). "amber" é o padrão (Meia-noite). Ver styles/palettes.css. */
export const PALETTES = ["amber", "ocean", "forest", "lavender", "rose", "sunset"] as const;
export type Palette = (typeof PALETTES)[number];

const STORAGE_KEY = "toca.theme";
const PALETTE_KEY = "toca.palette";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<(pref: ThemePreference) => void>();

export function loadTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light" || saved === "system") return saved;
  } catch {
    // sem armazenamento: usa o padrão
  }
  return "dark";
}

let current = loadTheme();

function loadPalette(): Palette {
  try {
    const saved = localStorage.getItem(PALETTE_KEY);
    if ((PALETTES as readonly string[]).includes(saved ?? "")) return saved as Palette;
  } catch {
    // sem armazenamento: usa o padrão
  }
  return "amber";
}

let palette = loadPalette();
const paletteListeners = new Set<(p: Palette) => void>();

/** Escuro não leva atributo (é o padrão dos tokens); claro leva data-theme="light" */
function apply(): void {
  const light = current === "light" || (current === "system" && !systemDark.matches);
  if (light) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  if (palette === "amber") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
}

export function setPalette(p: Palette): void {
  palette = p;
  try {
    localStorage.setItem(PALETTE_KEY, p);
  } catch {
    // continua valendo até fechar o app
  }
  apply();
  paletteListeners.forEach((l) => l(p));
}

export function usePalette(): [Palette, (p: Palette) => void] {
  const [value, setValue] = useState(palette);
  useEffect(() => {
    paletteListeners.add(setValue);
    return () => void paletteListeners.delete(setValue);
  }, []);
  return [value, setPalette];
}

/** Chamado uma vez antes de desenhar o app, para não piscar no tema errado */
export function initTheme(): void {
  apply();
  systemDark.addEventListener("change", apply);
}

export function setTheme(pref: ThemePreference): void {
  current = pref;
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // continua valendo até fechar o app
  }
  apply();
  listeners.forEach((l) => l(pref));
}

export function useTheme(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPref] = useState(current);
  useEffect(() => {
    listeners.add(setPref);
    return () => void listeners.delete(setPref);
  }, []);
  return [pref, setTheme];
}
