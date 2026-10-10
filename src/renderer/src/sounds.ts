import { getAudioSettings } from "./audioSettings";
import { captureDeviceId, loadDeviceId } from "./devices";

/** join: alguém entrou · leave: alguém saiu · self: você entrou · test: som de teste */
export type Cue = "join" | "leave" | "self" | "test";

/** Notas (Hz) e o intervalo entre elas */
const CUES: Record<Cue, { notes: number[]; step: number }> = {
  join: { notes: [587.33, 880], step: 0.11 }, // ré → lá, subindo
  leave: { notes: [880, 587.33], step: 0.11 }, // lá → ré, descendo
  self: { notes: [523.25, 659.25, 783.99], step: 0.07 }, // dó maior
  test: { notes: [523.25, 659.25], step: 0.18 },
};

let ctx: AudioContext | null = null;
let ctxSink = "";

/** Um contexto de áudio só, na saída escolhida nas configurações */
async function context(): Promise<AudioContext> {
  const sink = captureDeviceId(loadDeviceId("audiooutput")) ?? "";
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
    ctxSink = "";
  }
  if (sink !== ctxSink && "setSinkId" in ctx) {
    await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(sink).catch(() => {});
    ctxSink = sink;
  }
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  return ctx;
}

/** Toca um aviso curto no volume geral escolhido (silencioso se o volume for 0) */
export async function playCue(cue: Cue): Promise<void> {
  const volume = getAudioSettings().outputVolume;
  if (volume <= 0) return;
  const ac = await context();
  const out = ac.createGain();
  out.gain.value = (cue === "test" ? 0.25 : 0.12) * volume;
  out.connect(ac.destination);
  const { notes, step } = CUES[cue];
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    const t = ac.currentTime + 0.01 + i * step;
    osc.type = "sine";
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.32);
  });
  setTimeout(() => out.disconnect(), 1000 + notes.length * step * 1000);
}
