import { ConnectionQuality } from "livekit-client";

/** Níveis do LiveKit em barrinhas acesas (0 a 3) e texto */
export const QUALITY: Record<ConnectionQuality, { bars: number; label: string; tone: string }> = {
  [ConnectionQuality.Excellent]: { bars: 3, label: "Ótima", tone: "ok" },
  [ConnectionQuality.Good]: { bars: 2, label: "Boa", tone: "ok" },
  [ConnectionQuality.Poor]: { bars: 1, label: "Instável", tone: "warn" },
  [ConnectionQuality.Lost]: { bars: 0, label: "Caiu", tone: "bad" },
  [ConnectionQuality.Unknown]: { bars: 0, label: "Medindo", tone: "idle" },
};

/** A nota da chamada (0 a 100) nos mesmos níveis */
export function scoreBars(score: number): { bars: number; tone: string } {
  if (score >= 85) return { bars: 3, tone: "ok" };
  if (score >= 65) return { bars: 2, tone: "ok" };
  if (score >= 40) return { bars: 1, tone: "warn" };
  return { bars: 0, tone: "bad" };
}

/** Três barrinhas de sinal, como as do celular. Só visual: o texto vai no aria-label de quem usa. */
export function SignalBars({ bars, tone }: { bars: number; tone: string }) {
  return (
    <span className={`sig ${tone}`} aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <i key={n} className={n <= bars ? "on" : undefined} />
      ))}
    </span>
  );
}
