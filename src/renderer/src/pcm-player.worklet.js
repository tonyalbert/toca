// AudioWorklet que toca o PCM vindo do toca-audio-capture (s16le, 48 kHz,
// estéreo intercalado). Mantém um buffer pequeno para absorver a variação de
// chegada dos pacotes, sem acumular atraso.

const PRIME_FRAMES = 48000 * 0.04; // espera 40 ms antes de começar/retomar
const MAX_FRAMES = 48000 * 0.2; // acima de 200 ms acumulados, descarta o mais antigo
const TARGET_FRAMES = 48000 * 0.08; // ...até voltar a 80 ms

class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = []; // Int16Array intercalados
    this.offset = 0; // posição (em amostras) no primeiro item da fila
    this.buffered = 0; // quadros disponíveis
    this.playing = false;

    this.port.onmessage = (e) => {
      const chunk = new Int16Array(e.data);
      this.queue.push(chunk);
      this.buffered += chunk.length / 2;
      while (this.buffered > MAX_FRAMES && this.queue.length > 1) {
        const dropped = this.queue.shift();
        this.buffered -= (dropped.length - this.offset) / 2;
        this.offset = 0;
        if (this.buffered <= TARGET_FRAMES) break;
      }
    };
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    if (!this.playing && this.buffered >= PRIME_FRAMES) this.playing = true;

    for (let i = 0; i < left.length; i++) {
      if (!this.playing || this.queue.length === 0) {
        this.playing = false;
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      const chunk = this.queue[0];
      left[i] = chunk[this.offset] / 32768;
      right[i] = chunk[this.offset + 1] / 32768;
      this.offset += 2;
      this.buffered -= 1;
      if (this.offset >= chunk.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-player", PcmPlayer);
