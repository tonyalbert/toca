import { Track, type AudioProcessorOptions, type TrackProcessor } from "livekit-client";
import { rmsToDb, type AudioSettings } from "./audioSettings";

const CHECK_MS = 20;
/** Depois de ficar abaixo da sensibilidade, espera um pouco antes de fechar (não corta o fim das palavras) */
const HOLD_MS = 300;

/**
 * Processa o microfone antes de enviar: volume (ganho) e corte por
 * sensibilidade (abaixo de um nível, ninguém ouve nada). O LiveKit troca a
 * faixa enviada pela processedTrack daqui.
 */
export class MicProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = "toca-mic";
  processedTrack?: MediaStreamTrack;

  private settings: AudioSettings;
  private ctx?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private gain?: GainNode;
  private gate?: GainNode;
  private analyser?: AnalyserNode;
  private timer = 0;
  private lastLoud = 0;
  private open = true;
  private pttHeld = false;

  /** Tecla de apertar para falar segurada ou solta */
  setPushToTalk(held: boolean): void {
    this.pttHeld = held;
    if (this.settings.micMode === "ptt") this.setOpen(held);
  }

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  async init({ track, audioContext }: AudioProcessorOptions): Promise<void> {
    // No restart (troca de microfone, redução de ruído) o LiveKit não manda o
    // contexto de áudio de novo: usa o da primeira vez
    const ctx = audioContext ?? this.ctx;
    if (!ctx) throw new Error("sem contexto de áudio");
    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(new MediaStream([track]));
    this.gain = ctx.createGain();
    this.gate = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    const destination = ctx.createMediaStreamDestination();

    // microfone → volume → portão → envio; o nível é medido depois do volume
    this.source.connect(this.gain);
    this.gain.connect(this.gate);
    this.gate.connect(destination);
    this.gain.connect(this.analyser);
    this.processedTrack = destination.stream.getAudioTracks()[0];

    this.open = true;
    this.apply();
    const samples = new Float32Array(this.analyser.fftSize);
    this.timer = window.setInterval(() => this.check(samples), CHECK_MS);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init({ ...opts, audioContext: opts.audioContext ?? this.ctx! });
  }

  async destroy(): Promise<void> {
    clearInterval(this.timer);
    this.source?.disconnect();
    this.gain?.disconnect();
    this.gate?.disconnect();
    this.processedTrack?.stop();
    this.source = this.gain = this.gate = this.analyser = undefined;
    this.processedTrack = undefined;
  }

  /** Configurações novas valem na hora, sem reiniciar o microfone */
  update(settings: AudioSettings): void {
    this.settings = settings;
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.gain) return;
    this.gain.gain.setTargetAtTime(this.settings.micGain, this.ctx.currentTime, 0.02);
    if (this.settings.micMode === "ptt") this.setOpen(this.pttHeld);
    else if (this.settings.autoSensitivity) this.setOpen(true);
  }

  private check(samples: Float32Array<ArrayBuffer>) {
    if (!this.analyser || this.settings.micMode === "ptt" || this.settings.autoSensitivity) return;
    this.analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const db = rmsToDb(Math.sqrt(sum / samples.length));
    const now = performance.now();
    if (db >= this.settings.gateDb) {
      this.lastLoud = now;
      this.setOpen(true);
    } else if (now - this.lastLoud > HOLD_MS) {
      this.setOpen(false);
    }
  }

  private setOpen(open: boolean) {
    if (!this.ctx || !this.gate || open === this.open) return;
    this.open = open;
    // Abre rápido (não perde o começo da fala), fecha suave (sem estalo)
    this.gate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, open ? 0.005 : 0.05);
  }
}
