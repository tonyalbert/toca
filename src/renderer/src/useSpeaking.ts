import { useEffect, useState } from "react";

const SAMPLE_MS = 50;
/** Mesmo limiar do ícone do microfone (useMicLevel): os dois acendem juntos */
const SPEAKING_RMS = 0.012;
/** Mantém "falando" um pouco depois da última sílaba, para o card não piscar */
const HOLD_MS = 350;

/**
 * Quem está falando agora, medido no próprio app: o seu microfone (o mesmo
 * track do ícone) e o áudio de cada pessoa como chega aqui. O "falando" do
 * LiveKit vem do servidor e chega bem depois (ida e volta mais a suavização
 * dele); com isso o card acende junto com o ícone.
 *
 * tracks: identidade → áudio (null: sem áudio, ex. microfone desligado).
 * Devolve só quem tem áudio medido; para os outros, use o do servidor.
 */
export function useSpeaking(tracks: Map<string, MediaStreamTrack | null>): Map<string, boolean> {
  const [speaking, setSpeaking] = useState<Map<string, boolean>>(new Map());
  // Recria a medição só quando muda o conjunto de tracks (não a cada atualização da sala)
  const key = [...tracks].map(([id, t]) => `${id}:${t?.id ?? "-"}`).sort().join("|");

  useEffect(() => {
    const live = [...tracks].filter((entry): entry is [string, MediaStreamTrack] => !!entry[1] && entry[1].readyState === "live");
    if (live.length === 0) {
      setSpeaking(new Map());
      return;
    }
    const ctx = new AudioContext();
    const meters = live.map(([id, track]) => {
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      return { id, source, analyser, samples: new Float32Array(analyser.fftSize), lastLoud: 0 };
    });
    let current = new Map<string, boolean>(meters.map((m) => [m.id, false]));
    setSpeaking(current);

    const timer = setInterval(() => {
      const now = performance.now();
      let changed = false;
      const next = new Map<string, boolean>();
      for (const m of meters) {
        m.analyser.getFloatTimeDomainData(m.samples);
        let sum = 0;
        for (const v of m.samples) sum += v * v;
        if (Math.sqrt(sum / m.samples.length) > SPEAKING_RMS) m.lastLoud = now;
        const on = now - m.lastLoud < HOLD_MS;
        next.set(m.id, on);
        if (current.get(m.id) !== on) changed = true;
      }
      // Só re-renderiza quando alguém começa ou para de falar
      if (changed) {
        current = next;
        setSpeaking(next);
      }
    }, SAMPLE_MS);

    return () => {
      clearInterval(timer);
      meters.forEach((m) => m.source.disconnect());
      void ctx.close();
    };
  }, [key]);

  return speaking;
}
