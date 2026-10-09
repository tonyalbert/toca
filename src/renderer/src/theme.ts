import { useEffect, useState } from "react";

/** Preferência de tema. "system" segue o modo claro/escuro do Windows. */
export type ThemePreference = "dark" | "light" | "system";

const STORAGE_KEY = "toca.theme";
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

/** Escuro não leva atributo (é o padrão dos tokens); claro leva data-theme="light" */
function apply(): void {
  const light = current === "light" || (current === "system" && !systemDark.matches);
  if (light) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
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
