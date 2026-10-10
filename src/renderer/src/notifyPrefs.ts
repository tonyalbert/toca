import { useEffect, useState } from "react";

/** O que avisar (dentro do app e, com o Toca em segundo plano, pelo Windows) */
export interface NotifyPrefs {
  friendRequests: boolean;
  roomAdded: boolean;
  /** Aviso de mensagem direta nova */
  dmMessages: boolean;
  /** Aviso de mensagem nova no chat das salas (sem isso, só o contador) */
  roomMessages: boolean;
  /** Aviso do Windows quando o Toca está minimizado ou na bandeja */
  windowsWhenHidden: boolean;
  /** Som quando alguém entra ou sai da sala em que você está */
  roomSounds: boolean;
}

const DEFAULTS: NotifyPrefs = { friendRequests: true, roomAdded: true, dmMessages: true, roomMessages: false, windowsWhenHidden: true, roomSounds: true };
const STORAGE_KEY = "toca.notify";
const listeners = new Set<(p: NotifyPrefs) => void>();

function load(): NotifyPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<NotifyPrefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();

export const getNotifyPrefs = () => current;

export function setNotifyPrefs(changes: Partial<NotifyPrefs>): void {
  current = { ...current, ...changes };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // vale até fechar o app
  }
  listeners.forEach((l) => l(current));
}

export function useNotifyPrefs(): [NotifyPrefs, (changes: Partial<NotifyPrefs>) => void] {
  const [prefs, setPrefs] = useState(current);
  useEffect(() => {
    listeners.add(setPrefs);
    return () => void listeners.delete(setPrefs);
  }, []);
  return [prefs, setNotifyPrefs];
}
