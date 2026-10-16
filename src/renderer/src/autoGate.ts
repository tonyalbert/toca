/** Sensibilidade automática do microfone (sem dependências: roda também nos testes) */

/** Depois de ficar abaixo do limite, espera um pouco antes de fechar (não corta o fim das palavras) */
const HOLD_MS = 350;
/** Quanto acima do barulho de fundo a voz precisa estar */
const MARGIN_DB = 12;
/** Limites do corte automático */
const AUTO_MIN_DB = -60;
const AUTO_MAX_DB = -26;
/** Janela em que procuramos o momento mais quieto (o barulho de fundo) */
const WINDOW_MS = 3000;
/** Pedaços da janela (o mínimo de cada um é guardado) */
const SLOTS = 15;
/** Quadros seguidos acima do limite para abrir: um clique de teclado é curto, a fala não */
const ATTACK_FRAMES = 2;

/**
 * Sensibilidade automática: o barulho de fundo é o som mais baixo dos últimos
 * 3 segundos (método de "estatística do mínimo" dos filtros de voz). A fala
 * sempre tem pausas entre as palavras, que mostram o fundo; um ventilador ou
 * um ar-condicionado é constante e vira o próprio fundo em poucos segundos.
 * O microfone abre quando o som passa do fundo com folga.
 */
export class AutoGate {
  open = false;
  private lastLoud = -Infinity;
  /** Mínimo de cada pedaço da janela (o atual por último) */
  private slots: number[] = [];
  private slotStart = -Infinity;
  /** Nível suavizado (tira picos de um único quadro) */
  private smooth = -100;
  /** Quadros seguidos acima do limite */
  private above = 0;

  /** Barulho de fundo estimado (dBFS) */
  get floor(): number {
    return this.slots.length ? Math.min(...this.slots) : -60;
  }

  /** Limite atual: acima dele o microfone abre */
  get threshold(): number {
    return Math.min(AUTO_MAX_DB, Math.max(AUTO_MIN_DB, this.floor + MARGIN_DB));
  }

  /** Um nível medido agora; devolve se o microfone deve estar aberto */
  update(db: number, now = performance.now()): boolean {
    // O fundo usa o nível suavizado; a abertura usa o instantâneo (não perde o começo da fala)
    this.smooth = this.smooth < -99 ? db : this.smooth + (db - this.smooth) * 0.35;
    if (now - this.slotStart >= WINDOW_MS / SLOTS) {
      this.slots.push(this.smooth);
      if (this.slots.length > SLOTS) this.slots.shift();
      this.slotStart = now;
    } else {
      this.slots[this.slots.length - 1] = Math.min(this.slots[this.slots.length - 1], this.smooth);
    }

    this.above = db >= this.threshold ? this.above + 1 : 0;
    // Aberto, qualquer quadro acima segura; fechado, precisa de alguns seguidos
    if (this.above >= (this.open ? 1 : ATTACK_FRAMES)) {
      this.lastLoud = now;
      this.open = true;
    } else if (now - this.lastLoud > HOLD_MS) {
      this.open = false;
    }
    return this.open;
  }

  /** Corte manual (sensibilidade escolhida na barra) */
  static manual(db: number, gateDb: number, state: { lastLoud: number; open: boolean }, now = performance.now()): boolean {
    if (db >= gateDb) {
      state.lastLoud = now;
      state.open = true;
    } else if (now - state.lastLoud > HOLD_MS) {
      state.open = false;
    }
    return state.open;
  }
}
