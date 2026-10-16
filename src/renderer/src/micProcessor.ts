import { Track, type AudioProcessorOptions, type TrackProcessor } from "livekit-client";
import { rmsToDb, type AudioSettings } from "./audioSettings";
import { AutoGate, createRnnoise, NOISE_SAMPLE_RATE } from "./noise";

const CHECK_MS = 20;

/**
 * Processa o microfone antes de enviar: redução de ruído forte (RNNoise),
 * volume (ganho) e corte por sensibilidade (automática ou escolhida). O
 * LiveKit troca a faixa enviada pela processedTrack daqui.
 *
 * microfone → [RNNoise] → volume → portão → envio
 * O nível do portão é medido depois do RNNoise e do volume: o que conta é o
 * que sobra depois de tirar o ruído.
 */
export class MicProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = "toca-mic";
  processedTrack?: MediaStreamTrack;

  private settings: AudioSettings;
  private ctx?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private rnnoise?: AudioWorkletNode;
  private gain?: GainNode;
  private gate?: GainNode;
  private analyser?: AnalyserNode;
  private timer = 0;
  private open = true;
  private pttHeld = false;
  private auto = new AutoGate();
  private manual = { lastLoud: 0, open: true };
  /** Troca do nível de ruído em andamento (não monta duas cadeias ao mesmo tempo) */
  private wiring: Promise<void> = Promise.resolve();

  /** Tecla de apertar para falar segurada ou solta */
  setPushToTalk(held: boolean): void {
    this.pttHeld = held;
    if (this.settings.micMode === "ptt") this.setOpen(held);
  }

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  async init({ track }: AudioProcessorOptions): Promise<void> {
    // Contexto próprio em 48 kHz (o RNNoise foi treinado nessa taxa), reaproveitado
    // no restart (troca de microfone)
    this.ctx ??= new AudioContext({ sampleRate: NOISE_SAMPLE_RATE, latencyHint: "interactive" });
    const ctx = this.ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    this.source = ctx.createMediaStreamSource(new MediaStream([track]));
    this.gain = ctx.createGain();
    this.gate = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    const destination = ctx.createMediaStreamDestination();

    this.gain.connect(this.gate);
    this.gate.connect(destination);
    this.gain.connect(this.analyser);
    this.processedTrack = destination.stream.getAudioTracks()[0];
    await this.wire();

    this.open = true;
    this.auto = new AutoGate();
    this.apply();
    const samples = new Float32Array(this.analyser.fftSize);
    this.timer = window.setInterval(() => this.check(samples), CHECK_MS);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    clearInterval(this.timer);
    this.source?.disconnect();
    this.rnnoise?.disconnect();
    this.gain?.disconnect();
    this.gate?.disconnect();
    this.processedTrack?.stop();
    this.source = this.rnnoise = this.gain = this.gate = this.analyser = undefined;
    this.processedTrack = undefined;
  }

  /** Configurações novas valem na hora, sem reiniciar o microfone */
  update(settings: AudioSettings): void {
    const rewire = (settings.noiseLevel === "strong") !== (this.settings.noiseLevel === "strong");
    this.settings = settings;
    if (rewire) this.wiring = this.wiring.then(() => this.wire());
    this.apply();
  }

  /** Liga a entrada no volume, passando ou não pelo RNNoise */
  private async wire(): Promise<void> {
    const { ctx, source, gain } = this;
    if (!ctx || !source || !gain) return;
    source.disconnect();
    this.rnnoise?.disconnect();
    if (this.settings.noiseLevel === "strong") {
      try {
        this.rnnoise ??= await createRnnoise(ctx);
        source.connect(this.rnnoise).connect(gain);
        return;
      } catch (err) {
        // Sem o RNNoise (WASM bloqueado, CPU antiga): o microfone segue sem ele
        console.warn("redução de ruído forte indisponível:", (err as Error).message);
      }
    }
    source.connect(gain);
  }

  private apply() {
    if (!this.ctx || !this.gain) return;
    this.gain.gain.setTargetAtTime(this.settings.micGain, this.ctx.currentTime, 0.02);
    if (this.settings.micMode === "ptt") this.setOpen(this.pttHeld);
  }

  private check(samples: Float32Array<ArrayBuffer>) {
    if (!this.analyser || this.settings.micMode === "ptt") return;
    this.analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const db = rmsToDb(Math.sqrt(sum / samples.length));
    // A automática acompanha o ambiente sempre, para já estar pronta se for ligada
    const autoOpen = this.auto.update(db);
    this.setOpen(this.settings.autoSensitivity ? autoOpen : AutoGate.manual(db, this.settings.gateDb, this.manual));
  }

  private setOpen(open: boolean) {
    if (!this.ctx || !this.gate || open === this.open) return;
    this.open = open;
    // Abre rápido (não perde o começo da fala), fecha suave (sem estalo)
    this.gate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, open ? 0.005 : 0.05);
  }
}
