import { getAudioSettings } from "./audioSettings";
import { context } from "./sounds";

/**
 * Sons do soundboard. Os prontos são sintetizados aqui (nenhum arquivo de
 * áudio): cada um desenha o som com osciladores e ruído a partir do instante
 * t. Os da sala vêm da API (bytes) e tocam como AudioBuffer.
 */

type Synth = (ac: AudioContext, out: AudioNode, t: number) => number; // devolve a duração (s)

export interface BuiltinSound {
  id: string;
  name: string;
  emoji: string;
  play: Synth;
}

/** Ruído branco (o mesmo buffer serve para todos os sons) */
let noiseBuffer: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
  const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuffer = b);
}

/** Uma nota com envelope (ataque rápido, queda exponencial) */
function tone(ac: AudioContext, out: AudioNode, t: number, freq: number, dur: number, type: OscillatorType, gain = 1, endFreq?: number) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Um estouro de ruído filtrado */
function burst(ac: AudioContext, out: AudioNode, t: number, dur: number, filter: BiquadFilterType, freq: number, gain = 1, q = 1) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(env).connect(out);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const BUILTIN_SOUNDS: BuiltinSound[] = [
  {
    id: "buzina",
    name: "Buzina",
    emoji: "📯",
    play: (ac, out, t) => {
      const blasts: [number, number][] = [
        [0, 0.18],
        [0.24, 0.18],
        [0.48, 0.7],
      ];
      for (const [at, dur] of blasts) {
        for (const f of [415, 523, 622]) {
          const lp = ac.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 2600;
          lp.connect(out);
          tone(ac, lp, t + at, f * (1 + (Math.random() - 0.5) * 0.01), dur, "sawtooth", 0.28);
        }
      }
      return 1.3;
    },
  },
  {
    id: "badum",
    name: "Ba dum tss",
    emoji: "🥁",
    play: (ac, out, t) => {
      tone(ac, out, t, 190, 0.22, "sine", 0.9, 70);
      tone(ac, out, t + 0.2, 150, 0.28, "sine", 0.9, 60);
      burst(ac, out, t + 0.44, 1.1, "highpass", 6500, 0.5);
      return 1.6;
    },
  },
  {
    id: "aplausos",
    name: "Aplausos",
    emoji: "👏",
    play: (ac, out, t) => {
      const dur = 2.4;
      for (let i = 0; i < 90; i++) {
        const at = Math.random() * dur * (0.6 + 0.4 * Math.random());
        burst(ac, out, t + at, 0.05 + Math.random() * 0.04, "bandpass", 1200 + Math.random() * 1800, 0.35 * (1 - at / (dur * 1.2)), 1.5);
      }
      return dur + 0.2;
    },
  },
  {
    id: "fail",
    name: "Fail",
    emoji: "🎺",
    play: (ac, out, t) => {
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      lp.connect(out);
      const notes = [392, 370, 349];
      notes.forEach((f, i) => tone(ac, lp, t + i * 0.38, f, 0.36, "sawtooth", 0.35));
      // A última nota tremendo
      const osc = ac.createOscillator();
      const env = ac.createGain();
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 330;
      lfo.frequency.value = 6;
      depth.gain.value = 9;
      lfo.connect(depth).connect(osc.frequency);
      const at = t + notes.length * 0.38;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      env.gain.setValueAtTime(0.35, at + 0.9);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
      osc.connect(env).connect(lp);
      osc.start(at);
      lfo.start(at);
      osc.stop(at + 1.35);
      lfo.stop(at + 1.35);
      return 2.6;
    },
  },
  {
    id: "grilos",
    name: "Grilos",
    emoji: "🦗",
    play: (ac, out, t) => {
      for (let group = 0; group < 4; group++) {
        for (let i = 0; i < 3; i++) tone(ac, out, t + group * 0.55 + i * 0.07, 4300, 0.05, "sine", 0.18);
      }
      return 2.3;
    },
  },
  {
    id: "tcharam",
    name: "Tcharam",
    emoji: "🎉",
    play: (ac, out, t) => {
      const arp = [523, 659, 784];
      arp.forEach((f, i) => tone(ac, out, t + i * 0.09, f, 0.18, "triangle", 0.4));
      for (const f of [523, 659, 784, 1047]) tone(ac, out, t + 0.32, f, 1.1, "triangle", 0.26);
      return 1.5;
    },
  },
  {
    id: "boing",
    name: "Boing",
    emoji: "🪀",
    play: (ac, out, t) => {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.18);
      lfo.frequency.value = 18;
      depth.gain.setValueAtTime(60, t);
      depth.gain.exponentialRampToValueAtTime(1, t + 0.8);
      lfo.connect(depth).connect(osc.frequency);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      osc.connect(env).connect(out);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 0.9);
      lfo.stop(t + 0.9);
      return 1;
    },
  },
  {
    id: "suspense",
    name: "Suspense",
    emoji: "😱",
    play: (ac, out, t) => {
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.connect(out);
      for (const [at, f, dur] of [
        [0, 147, 0.3],
        [0.38, 156, 0.3],
        [0.76, 117, 1.6],
      ] as const) {
        tone(ac, lp, t + at, f, dur, "sawtooth", 0.45);
        tone(ac, lp, t + at, f / 2, dur, "square", 0.25);
      }
      return 2.5;
    },
  },
  {
    id: "erro",
    name: "Errou",
    emoji: "❌",
    play: (ac, out, t) => {
      tone(ac, out, t, 140, 0.55, "square", 0.25);
      tone(ac, out, t, 147, 0.55, "square", 0.2);
      return 0.7;
    },
  },
];

const VOLUME_KEY = "toca.soundboard.volume";

/** Volume do soundboard (0 = sem som); vale só para você */
export function getSoundboardVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && v >= 0 && v <= 1 ? v : 0.7;
  } catch {
    return 0.7;
  }
}

export function setSoundboardVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    // só nesta sessão
  }
}

/** Saída com o volume geral × o do soundboard */
async function output(): Promise<{ ac: AudioContext; out: GainNode } | null> {
  const volume = getAudioSettings().outputVolume * getSoundboardVolume();
  if (volume <= 0) return null;
  const ac = await context();
  const out = ac.createGain();
  out.gain.value = 0.55 * volume;
  out.connect(ac.destination);
  return { ac, out };
}

export async function playBuiltin(id: string): Promise<void> {
  const sound = BUILTIN_SOUNDS.find((s) => s.id === id);
  const o = sound && (await output());
  if (!sound || !o) return;
  const duration = sound.play(o.ac, o.out, o.ac.currentTime + 0.02);
  setTimeout(() => o.out.disconnect(), (duration + 0.5) * 1000);
}

// Sons da sala já baixados e decodificados
const decoded = new Map<string, Promise<AudioBuffer>>();

export async function playBuffer(id: string, load: () => Promise<Blob>): Promise<void> {
  const o = await output();
  if (!o) return;
  let buffer = decoded.get(id);
  if (!buffer) {
    buffer = load()
      .then((b) => b.arrayBuffer())
      .then((data) => o.ac.decodeAudioData(data));
    decoded.set(id, buffer);
    buffer.catch(() => decoded.delete(id));
  }
  const b = await buffer;
  const src = o.ac.createBufferSource();
  src.buffer = b;
  src.connect(o.out);
  src.start();
  src.onended = () => o.out.disconnect();
}

/** Duração de um arquivo de áudio (para recusar sons longos antes de subir) */
export async function audioDuration(file: Blob): Promise<number> {
  const ac = await context();
  const b = await ac.decodeAudioData(await file.arrayBuffer());
  return b.duration;
}
