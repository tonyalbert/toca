import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

/**
 * Redução de ruído e sensibilidade automática do microfone (a mesma lógica na
 * chamada e no teste das Configurações).
 *
 * - off: nada
 * - light: o filtro do próprio navegador (WebRTC): leve, deixa passar teclado
 * - strong: RNNoise, uma rede neural feita para voz: corta teclado, ventilador
 *   e barulho de fundo de verdade
 */
export type NoiseLevel = "off" | "light" | "strong";

/** O filtro do navegador só no nível leve (no forte, o RNNoise faz o trabalho sozinho) */
export const browserNoiseSuppression = (level: NoiseLevel) => level === "light";

/** O RNNoise foi treinado em 48 kHz: o contexto de áudio do microfone usa essa taxa */
export const NOISE_SAMPLE_RATE = 48000;

let wasm: Promise<ArrayBuffer> | null = null;
const withWorklet = new WeakSet<BaseAudioContext>();

/** Nó do RNNoise para este contexto (o WASM é baixado uma vez só) */
export async function createRnnoise(ctx: AudioContext): Promise<AudioWorkletNode> {
  wasm ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdUrl }).catch((err) => {
    wasm = null;
    throw err;
  });
  if (!withWorklet.has(ctx)) {
    await ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
    withWorklet.add(ctx);
  }
  return new RnnoiseWorkletNode(ctx, { wasmBinary: await wasm, maxChannels: 1 });
}

/**
 * Microfone com o RNNoise aplicado (para o teste das Configurações mostrar o
 * que os amigos ouvem). close() desfaz tudo.
 */
export async function denoisedTrack(track: MediaStreamTrack): Promise<{ track: MediaStreamTrack; close: () => void }> {
  const ctx = new AudioContext({ sampleRate: NOISE_SAMPLE_RATE, latencyHint: "interactive" });
  try {
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const rnnoise = await createRnnoise(ctx);
    const out = ctx.createMediaStreamDestination();
    source.connect(rnnoise).connect(out);
    const result = out.stream.getAudioTracks()[0];
    return {
      track: result,
      close: () => {
        source.disconnect();
        rnnoise.disconnect();
        result.stop();
        void ctx.close();
      },
    };
  } catch (err) {
    void ctx.close();
    throw err;
  }
}

export { AutoGate } from "./autoGate";
