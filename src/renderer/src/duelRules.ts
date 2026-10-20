import type { DuelSession, Seat } from "./duel";
import { encodeAvatar, FACES, FURS, GLASSES, HATS, OUTFITS, SPECIES, TONES, type Avatar, type AvatarConfig, type Species } from "./avatar";

/**
 * Regras dos jogos de 2. apply devolve o estado novo, ou null se a jogada não
 * vale (ou ainda não vale: chegou antes da jogada de que depende). Não muda o
 * estado recebido.
 */
export interface DuelRules<S, E, X = never> {
  init(s: DuelSession): S;
  apply(state: S, e: E, by: Seat, s: DuelSession): S | null;
  /** O segredo de cada jogador, sorteado no PC dele ao começar */
  initSecret?(s: DuelSession, seat: Seat): X;
  /** Jogada automática de quem tem o segredo */
  respond?(state: S, seat: Seat, secret: X | null, s: DuelSession): E | null;
  /** Quem ganhou (null: ainda jogando; "draw": empate) */
  result(state: S): Seat | "draw" | null;
  /** De quem é a vez (null: ninguém em especial) */
  turn(state: S): Seat | null;
}

// ---------- Lig 4 ----------

export const LIG4_COLS = 7;
export const LIG4_ROWS = 6;

export interface Lig4State {
  /** Linha por linha, de cima para baixo: -1 vazio, 0 ou 1 = de quem é */
  board: number[];
  turn: Seat;
  winner: Seat | null;
  draw: boolean;
  /** As peças da linha vencedora */
  line: number[];
  last: number | null;
}
export type Lig4Event = { k: "drop"; col: number };

/** As peças em linha (4 ou mais) que passam por i, se houver */
function lineThrough(board: number[], i: number): number[] {
  const who = board[i];
  const r0 = Math.floor(i / LIG4_COLS);
  const c0 = i % LIG4_COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < LIG4_ROWS && c >= 0 && c < LIG4_COLS && board[r * LIG4_COLS + c] === who) {
        cells.push(r * LIG4_COLS + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

/** Onde a peça cai nessa coluna (null: cheia) */
export function lig4Landing(board: number[], col: number): number | null {
  for (let r = LIG4_ROWS - 1; r >= 0; r--) if (board[r * LIG4_COLS + col] === -1) return r * LIG4_COLS + col;
  return null;
}

export const lig4: DuelRules<Lig4State, Lig4Event> = {
  init: () => ({ board: Array(LIG4_COLS * LIG4_ROWS).fill(-1), turn: 0, winner: null, draw: false, line: [], last: null }),
  apply(s, e, by) {
    if (e?.k !== "drop" || s.winner !== null || s.draw || by !== s.turn) return null;
    if (!Number.isInteger(e.col) || e.col < 0 || e.col >= LIG4_COLS) return null;
    const i = lig4Landing(s.board, e.col);
    if (i === null) return null;
    const board = [...s.board];
    board[i] = by;
    const line = lineThrough(board, i);
    return {
      board,
      turn: (1 - by) as Seat,
      winner: line.length ? by : null,
      draw: !line.length && board.every((c) => c !== -1),
      line,
      last: i,
    };
  },
  result: (s) => s.winner ?? (s.draw ? "draw" : null),
  turn: (s) => (s.winner === null && !s.draw ? s.turn : null),
};

// ---------- Batalha Naval ----------

export const NAVAL_SIZE = 10;
export const FLEET: { name: string; len: number }[] = [
  { name: "Porta-aviões", len: 5 },
  { name: "Encouraçado", len: 4 },
  { name: "Cruzador", len: 3 },
  { name: "Submarino", len: 3 },
  { name: "Destróier", len: 2 },
];

export interface Ship {
  name: string;
  len: number;
  x: number;
  y: number;
  /** Deitado (para a direita); em pé, para baixo */
  h: boolean;
}

export interface NavalShot {
  x: number;
  y: number;
  hit: boolean;
}

/** O mar de um jogador: os tiros que levou e os navios dele que afundaram */
export interface NavalSea {
  shots: NavalShot[];
  sunk: Ship[];
}

export interface NavalState {
  ready: [boolean, boolean];
  /** Quem atira */
  turn: Seat;
  seas: [NavalSea, NavalSea];
  /** Tiro esperando a resposta do alvo */
  pending: { x: number; y: number } | null;
  /** O último tiro respondido (para o aviso "água", "afundou") */
  last: { by: Seat; x: number; y: number; hit: boolean; sunk: string | null } | null;
  winner: Seat | null;
  /** A frota de cada um, mostrada no fim */
  fleets: [Ship[] | null, Ship[] | null];
}

export type NavalEvent =
  | { k: "ready" }
  | { k: "shot"; x: number; y: number }
  | { k: "result"; x: number; y: number; hit: boolean; sunk: Ship | null; lost: boolean }
  | { k: "reveal"; fleet: Ship[] };

export const shipCells = (s: Ship): [number, number][] =>
  Array.from({ length: s.len }, (_, i) => (s.h ? [s.x + i, s.y] : [s.x, s.y + i]));

const inSea = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < NAVAL_SIZE && y < NAVAL_SIZE;

/** O navio cabe ali sem encostar em outro (nem na diagonal)? */
export function shipFits(ship: Ship, others: Ship[]): boolean {
  const cells = shipCells(ship);
  if (!cells.every(([x, y]) => inSea(x, y))) return false;
  return others.every((o) => shipCells(o).every(([ox, oy]) => cells.every(([x, y]) => Math.abs(x - ox) > 1 || Math.abs(y - oy) > 1)));
}

/** Frota em posições sorteadas */
export function randomFleet(): Ship[] {
  for (;;) {
    const fleet: Ship[] = [];
    for (const { name, len } of FLEET) {
      for (let tries = 0; tries < 200; tries++) {
        const h = Math.random() < 0.5;
        const x = Math.floor(Math.random() * (h ? NAVAL_SIZE - len + 1 : NAVAL_SIZE));
        const y = Math.floor(Math.random() * (h ? NAVAL_SIZE : NAVAL_SIZE - len + 1));
        const ship: Ship = { name, len, h, x, y };
        if (shipFits(ship, fleet)) {
          fleet.push(ship);
          break;
        }
      }
    }
    if (fleet.length === FLEET.length) return fleet;
  }
}

const emptySea = (): NavalSea => ({ shots: [], sunk: [] });

export const naval: DuelRules<NavalState, NavalEvent, Ship[]> = {
  init: () => ({ ready: [false, false], turn: 0, seas: [emptySea(), emptySea()], pending: null, last: null, winner: null, fleets: [null, null] }),
  apply(s, e, by) {
    switch (e?.k) {
      case "ready": {
        if (s.ready[by]) return null;
        const ready: [boolean, boolean] = [...s.ready];
        ready[by] = true;
        return { ...s, ready };
      }
      case "shot": {
        if (!s.ready[0] || !s.ready[1] || s.winner !== null || s.pending || by !== s.turn || !inSea(e.x, e.y)) return null;
        if (s.seas[1 - by].shots.some((sh) => sh.x === e.x && sh.y === e.y)) return null;
        return { ...s, pending: { x: e.x, y: e.y } };
      }
      case "result": {
        // Quem responde é o alvo, sobre o tiro pendente
        if (!s.pending || by === s.turn || s.pending.x !== e.x || s.pending.y !== e.y) return null;
        const seas: [NavalSea, NavalSea] = [...s.seas];
        const sea = seas[by];
        seas[by] = { shots: [...sea.shots, { x: e.x, y: e.y, hit: !!e.hit }], sunk: e.sunk ? [...sea.sunk, e.sunk] : sea.sunk };
        const shooter = s.turn;
        return {
          ...s,
          seas,
          pending: null,
          last: { by: shooter, x: e.x, y: e.y, hit: !!e.hit, sunk: e.sunk?.name ?? null },
          winner: e.lost ? shooter : null,
          turn: e.lost ? shooter : by,
        };
      }
      case "reveal": {
        if (s.winner === null || s.fleets[by] || !Array.isArray(e.fleet)) return null;
        const fleets: [Ship[] | null, Ship[] | null] = [...s.fleets];
        fleets[by] = e.fleet;
        return { ...s, fleets };
      }
    }
    return null;
  },
  initSecret: () => randomFleet(),
  respond(s, seat, fleet) {
    if (!fleet || !s.ready[seat]) return null;
    if (s.winner !== null) return s.fleets[seat] ? null : { k: "reveal", fleet };
    if (!s.pending || s.turn === seat) return null;
    const { x, y } = s.pending;
    const hits = [...s.seas[seat].shots.filter((sh) => sh.hit), { x, y }];
    const isHit = ([cx, cy]: [number, number]) => hits.some((h) => h.x === cx && h.y === cy);
    const ship = fleet.find((sh) => shipCells(sh).some(([cx, cy]) => cx === x && cy === y)) ?? null;
    const sunk = ship && shipCells(ship).every(isHit) ? ship : null;
    const lost = fleet.every((sh) => shipCells(sh).every(isHit));
    return { k: "result", x, y, hit: !!ship, sunk, lost };
  },
  result: (s) => s.winner,
  turn: (s) => (s.ready[0] && s.ready[1] && s.winner === null ? s.turn : null),
};

// ---------- Cara a Cara ----------

export const CARA_COUNT = 24;

export interface CaraCard {
  name: string;
  avatar: Avatar;
}

const CARA_NAMES = [
  "Ana", "Beto", "Bia", "Caio", "Dani", "Duda", "Edu", "Fefa", "Gabi", "Guto", "Iara", "Juca", "Kika", "Léo", "Lia",
  "Lulu", "Malu", "Mel", "Nico", "Olga", "Pipo", "Quim", "Rafa", "Sami", "Tati", "Téo", "Tito", "Vavá", "Vivi", "Zeca",
];

/** Sorteio com semente: o mesmo em todos os PCs */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Os 24 bichinhos da partida: 8 de cada espécie, todos diferentes */
export function caraCards(seed: number): CaraCard[] {
  const rnd = seeded(seed);
  const one = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const names = [...CARA_NAMES];
  const species: Species[] = SPECIES.flatMap((sp) => Array<Species>(CARA_COUNT / SPECIES.length).fill(sp));
  const cards: CaraCard[] = [];
  const seen = new Set<string>();
  for (let i = 0; cards.length < CARA_COUNT; i++) {
    const config: AvatarConfig = {
      species: species[cards.length],
      fur: one(FURS),
      face: one(FACES),
      // Metade sem chapéu e a maioria sem óculos: perguntas de sim ou não ficam boas
      hat: rnd() < 0.5 ? "none" : one(HATS.filter((h) => h !== "none")),
      glasses: rnd() < 0.6 ? "none" : one(GLASSES.filter((g) => g !== "none")),
      outfit: one(OUTFITS),
      tone: one(TONES),
      background: "plain",
    };
    const avatar = encodeAvatar(config);
    if (seen.has(avatar) && i < 1000) continue;
    seen.add(avatar);
    const name = names.splice(Math.floor(rnd() * names.length), 1)[0];
    cards.push({ name, avatar });
  }
  // Embaralha (senão as espécies ficam em blocos)
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export interface CaraState {
  /** Quem pergunta agora */
  turn: Seat;
  /** O chute esperando a resposta (e, no fim, o chute que decidiu) */
  guess: { by: Seat; card: number } | null;
  /** O chute estava certo? (null: ainda não respondido) */
  right: boolean | null;
  winner: Seat | null;
  /** O bichinho de cada um, mostrado no fim */
  secrets: [number | null, number | null];
}

export type CaraEvent = { k: "pass" } | { k: "guess"; card: number } | { k: "answer"; right: boolean } | { k: "reveal"; card: number };

const isCard = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < CARA_COUNT;

export const cara: DuelRules<CaraState, CaraEvent, number> = {
  init: () => ({ turn: 0, guess: null, right: null, winner: null, secrets: [null, null] }),
  apply(s, e, by) {
    switch (e?.k) {
      case "pass":
        if (s.winner !== null || s.guess || by !== s.turn) return null;
        return { ...s, turn: (1 - by) as Seat };
      case "guess":
        if (s.winner !== null || s.guess || by !== s.turn || !isCard(e.card)) return null;
        return { ...s, guess: { by, card: e.card } };
      case "answer":
        // Quem responde é quem tem o bichinho; errou o chute, perdeu
        if (!s.guess || s.winner !== null || by === s.guess.by) return null;
        return { ...s, right: !!e.right, winner: e.right ? s.guess.by : by };
      case "reveal": {
        if (s.winner === null || s.secrets[by] !== null || !isCard(e.card)) return null;
        const secrets: [number | null, number | null] = [...s.secrets];
        secrets[by] = e.card;
        return { ...s, secrets };
      }
    }
    return null;
  },
  initSecret: () => Math.floor(Math.random() * CARA_COUNT),
  respond(s, seat, secret) {
    if (secret === null) return null;
    if (s.winner !== null) return s.secrets[seat] === null ? { k: "reveal", card: secret } : null;
    if (s.guess && s.guess.by !== seat) return { k: "answer", right: s.guess.card === secret };
    return null;
  },
  result: (s) => s.winner,
  turn: (s) => (s.winner === null ? s.turn : null),
};

// ---------- todos ----------

export type DuelKind = "lig4" | "naval" | "cara";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DUEL_RULES: Record<DuelKind, DuelRules<any, any, any>> = { lig4, naval, cara };

export const DUEL_NAMES: Record<DuelKind, string> = { lig4: "Lig 4", naval: "Batalha Naval", cara: "Cara a Cara" };
