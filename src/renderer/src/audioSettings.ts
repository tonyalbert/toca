import { useEffect, useState } from "react";
import type { PushToTalkBinding } from "../../shared/pushToTalk";
import type { NoiseLevel } from "./noise";

/** Preferências de áudio deste PC (valem em todas as salas) */
export interface AudioSettings {
  /** Volume do seu microfone para os outros (1 = 100%; vai até 2) */
  micGain: number;
  /** O Toca mede o barulho do ambiente e só abre o microfone quando você fala (ver AutoGate) */
  autoSensitivity: boolean;
  /** Abaixo deste nível (dBFS) o microfone fecha, quando autoSensitivity é false */
  gateDb: number;
  /** Volume geral de tudo o que você ouve (1 = 100%; vai até 2) */
  outputVolume: number;
  /** Redução de ruído de fundo (ver noise.ts) */
  noiseLevel: NoiseLevel;
  /** voice: microfone abre sozinho · ptt: só enquanto a tecla está segurada */
  micMode: "voice" | "ptt";
  pttBinding: PushToTalkBinding | null;
  /** Nome da tecla para mostrar (ex.: "F8") */
  pttLabel: string | null;
}

export const MAX_GAIN = 2;
export const GATE_MIN_DB = -70;
export const GATE_MAX_DB = -20;

const DEFAULTS: AudioSettings = {
  micGain: 1,
  autoSensitivity: true,
  gateDb: -50,
  outputVolume: 1,
  noiseLevel: "strong",
  micMode: "voice",
  pttBinding: null,
  pttLabel: null,
};

const STORAGE_KEY = "toca.audio";
const listeners = new Set<(s: AudioSettings) => void>();

function load(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AudioSettings> & { noiseSuppression?: boolean };
    // Até a 2.0: só liga/desliga (o filtro leve do navegador). Ligado vira o forte.
    if (!saved.noiseLevel && saved.noiseSuppression !== undefined) saved.noiseLevel = saved.noiseSuppression ? "strong" : "off";
    delete saved.noiseSuppression;
    const merged = { ...DEFAULTS, ...saved };
    if (!["off", "light", "strong"].includes(merged.noiseLevel)) merged.noiseLevel = DEFAULTS.noiseLevel;
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();

export function getAudioSettings(): AudioSettings {
  return current;
}

export function updateAudioSettings(changes: Partial<AudioSettings>): void {
  current = { ...current, ...changes };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // sem armazenamento: vale até fechar o app
  }
  listeners.forEach((l) => l(current));
}

/** Avisa a cada mudança; devolve a função que cancela */
export function onAudioSettings(listener: (s: AudioSettings) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useAudioSettings(): [AudioSettings, (changes: Partial<AudioSettings>) => void] {
  const [settings, setSettings] = useState(current);
  useEffect(() => onAudioSettings(setSettings), []);
  return [settings, updateAudioSettings];
}

/** Nível (dBFS) a partir do RMS de amostras de -1 a 1 */
export function rmsToDb(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}
