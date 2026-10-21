import { ScreenSharePresets, type VideoPreset } from "livekit-client";

/** Qualidade do compartilhamento de tela: menos resolução e fps = menos uso do PC e da internet */
export type ScreenQuality = "light" | "balanced" | "sharp" | "high";

export const SCREEN_QUALITIES: { value: ScreenQuality; label: string; preset: VideoPreset; contentHint: "detail" | "motion" }[] = [
  { value: "light", label: "Leve · 720p, 15 fps", preset: ScreenSharePresets.h720fps15, contentHint: "detail" },
  { value: "balanced", label: "Equilibrada · 720p, 30 fps", preset: ScreenSharePresets.h720fps30, contentHint: "motion" },
  { value: "sharp", label: "Nítida · 1080p, 15 fps (textos e código)", preset: ScreenSharePresets.h1080fps15, contentHint: "detail" },
  { value: "high", label: "Alta · 1080p, 30 fps", preset: ScreenSharePresets.h1080fps30, contentHint: "detail" },
];

const STORAGE_KEY = "toca.screenQuality";
const DEFAULT: ScreenQuality = "balanced";

export function getScreenQuality(): ScreenQuality {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SCREEN_QUALITIES.some((q) => q.value === saved) ? (saved as ScreenQuality) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setScreenQuality(quality: ScreenQuality): void {
  try {
    localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    // vale até fechar o app
  }
}

export const screenQualityOf = (quality: ScreenQuality) => SCREEN_QUALITIES.find((q) => q.value === quality) ?? SCREEN_QUALITIES[1];

/**
 * Opções de captura e de envio para a qualidade escolhida, pensadas para pesar
 * pouco no PC de quem compartilha:
 * - a captura já sai no tamanho e fps escolhidos (limite "max"), em vez de
 *   capturar a tela na resolução nativa (2K/4K) e reduzir depois;
 * - H.264 usa o codificador de vídeo da placa (Intel, NVIDIA, AMD) quando há,
 *   no lugar do VP8, que codifica tudo no processador;
 * - sem simulcast: uma codificação só, em vez de duas cópias em tamanhos diferentes.
 */
export function screenShareOptions(quality: ScreenQuality) {
  const { preset, contentHint } = screenQualityOf(quality);
  const { width, height, frameRate } = preset.resolution;
  return {
    capture: { resolution: preset.resolution, contentHint },
    /** Aplicado na faixa capturada: o LiveKit só pede o tamanho como "ideal" */
    limits: { width: { max: width }, height: { max: height }, frameRate: { max: frameRate } } as MediaTrackConstraints,
    publish: { screenShareEncoding: preset.encoding, videoCodec: "h264" as const, simulcast: false },
  };
}
