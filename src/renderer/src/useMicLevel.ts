import { useEffect, useState } from "react";
import type { LocalAudioTrack } from "livekit-client";

const SAMPLE_MS = 50;
/** Volume RMS (0..1) a partir do qual consideramos que você está falando */
const SPEAKING_RMS = 0.012;
/** RMS que já conta como "volume máximo" na animação do ícone */
const FULL_RMS = 0.2;
/** Mantém "falando" um pouco depois da última sílaba, para não piscar */
const HOLD_MS = 300;

/**
 * Mede o volume do nosso microfone direto no app (sem esperar o servidor).
 * O track já passou pelo filtro de ruído, então reflete o que os outros ouvem.
 *
 * Não usa o createAudioAnalyser do livekit-client: a faixa padrão dele
 * (-100 a -80 dB) satura com qualquer resíduo e o ícone ficava sempre aceso.
 */
export function useMicLevel(track: LocalAudioTrack | null, muted: boolean) {
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setLevel(0);
    setSpeaking(false);
    if (!track || muted) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let lastLoud = 0;

    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);

      const now = performance.now();
      if (rms > SPEAKING_RMS) lastLoud = now;
      // Arredonda para não re-renderizar a cada variação mínima
      setLevel(Math.round(Math.min(1, rms / FULL_RMS) * 20) / 20);
      setSpeaking(now - lastLoud < HOLD_MS);
    }, SAMPLE_MS);

    return () => {
      clearInterval(id);
      source.disconnect();
      void ctx.close();
    };
  }, [track, muted]);

  return { level, speaking };
}
