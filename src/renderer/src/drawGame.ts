import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState } from "livekit-client";
import type { VoiceRoom } from "./useVoiceRoom";
import { pickWords } from "./drawWords";
import { playCue } from "./sounds";

/**
 * Desenha e Adivinha (estilo Gartic): na sua vez você desenha e o resto da
 * sala chuta digitando. Quem começa o jogo conduz ("host"): sorteia as
 * palavras, confere os chutes, conta o tempo e os pontos e manda o estado para
 * todos. A palavra só sai do PC dele para quem desenha (e para quem acerta).
 * Os traços vão direto de quem desenha para a sala. Tudo pelo canal de dados
 * da chamada (LiveKit), como o cinema.
 */

export const DRAW_TOPIC = "toca.desenho";
/** O quadro tem tamanho fixo: cada tela só muda a escala */
export const BOARD_W = 800;
export const BOARD_H = 600;
/** Tempo para quem desenha escolher a palavra */
const CHOOSE_MS = 15_000;
/** Tempo mostrando a palavra no fim da vez */
const REVEAL_MS = 6_000;
/** De quanto em quanto tempo os pontos do traço saem */
const FLUSH_MS = 40;
const MAX_FEED = 150;
/** Tamanho máximo (caracteres) de cada pedaço do desenho mandado a quem chegou */
const SYNC_CHUNK = 12_000;
/** Pontos de quem desenha a cada acerto */
const DRAWER_POINTS = 3;

export interface DrawSettings {
  rounds: number;
  /** Tempo para desenhar, em segundos */
  seconds: number;
}
export const DEFAULT_SETTINGS: DrawSettings = { rounds: 3, seconds: 80 };

export interface DrawPlayer {
  id: string;
  name: string;
  score: number;
}

export type DrawPhase = "choosing" | "drawing" | "reveal" | "end";

export interface DrawState {
  /** Muda a cada jogo */
  id: string;
  host: string;
  /** Relógio de quem começou (Date.now): dois jogos ao mesmo tempo, o mais novo vale */
  started: number;
  settings: DrawSettings;
  /** Na ordem de desenhar; quem sai continua aqui (com os pontos), só perde a vez */
  players: DrawPlayer[];
  round: number;
  /** Quem já desenhou nesta rodada */
  drawn: string[];
  /** Conta as vezes: muda a cada desenho */
  turn: number;
  drawer: string | null;
  phase: DrawPhase;
  /** Quanto faltava (ms) da fase quando o host mandou */
  left: number;
  /** A palavra com as letras escondidas ("_") e as dicas já reveladas */
  hint: string | null;
  /** Quem acertou nesta vez, na ordem */
  guessed: string[];
  /** A palavra, no fim da vez (null: ninguém desenhou) */
  word: string | null;
  /** Pontos ganhos nesta vez */
  gained: Record<string, number>;
  /** Conta as mudanças: a maior vale */
  rev: number;
}

/** O estado como chegou aqui: at = performance.now() da chegada */
export type LocalDraw = DrawState & { at: number };

export type LineOp = { k: "line"; id: string; c: string; w: number; p: number[] };
export type FillOp = { k: "fill"; id: string; c: string; x: number; y: number };
/** Um passo do desenho. Linha: p = [x0, y0, x1, y1, …] no quadro de BOARD_W × BOARD_H */
export type Op = LineOp | FillOp;

/** O que mudou no quadro: reset = redesenhar tudo; pts = a linha ganhou pontos a partir de from */
export type BoardEvent = { kind: "reset" } | { kind: "op"; op: Op } | { kind: "pts"; op: LineOp; from: number };

type FeedBody =
  | { kind: "guess"; by: string; text: string }
  | { kind: "hit"; by: string }
  | { kind: "close"; text: string }
  | { kind: "info"; text: string };
export type FeedItem = FeedBody & { key: number };

type DrawMessage =
  | { t: "state"; s: DrawState }
  | { t: "end"; id: string }
  /** Quem acabou de entrar pede o jogo e o desenho */
  | { t: "hello" }
  | { t: "options"; id: string; turn: number; words: string[] }
  | { t: "pick"; id: string; turn: number; i: number }
  | { t: "word"; id: string; turn: number; word: string }
  | { t: "guess"; id: string; turn: number; text: string }
  | { t: "feed"; id: string; item: FeedBody }
  | { t: "op"; id: string; turn: number; op: Op }
  | { t: "pts"; id: string; turn: number; op: string; p: number[] }
  | { t: "undo"; id: string; turn: number }
  | { t: "clear"; id: string; turn: number }
  | { t: "ops"; id: string; turn: number; ops: Op[]; first: boolean };

// ---------- regras (sem React) ----------

/** Sem acento, maiúscula, pontuação nem espaço: "Guarda-chuva" = "guardachuva" */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Errou por uma letra (em palavras de 4 letras ou mais) */
export function isClose(guess: string, word: string): boolean {
  const g = normalize(guess);
  const w = normalize(word);
  return w.length >= 4 && g !== w && distance(g, w) === 1;
}

const isLetter = (ch: string) => /[\p{L}\d]/u.test(ch);

/** "_ _ _" com as letras reveladas no lugar (espaço e hífen aparecem) */
export function maskWord(word: string, revealed: ReadonlySet<number> = new Set()): string {
  return [...word].map((ch, i) => (isLetter(ch) && !revealed.has(i) ? "_" : ch)).join("");
}

/** Pontos de quem acerta: o primeiro leva 10, depois um a menos, no mínimo 5 */
export const guessPoints = (order: number) => Math.max(10 - order, 5);

/** O estado a deve substituir b? Jogo novo ganha do antigo; no mesmo jogo, a mudança mais nova */
export function replaces(a: DrawState, b: DrawState): boolean {
  if (a.id !== b.id) return a.started > b.started || (a.started === b.started && a.id > b.id);
  return a.rev > b.rev;
}

/** Quanto falta da fase (ms) */
export const remaining = (s: LocalDraw, now = performance.now()) => Math.max(0, s.at + s.left - now);

/** Quem assume se o host saiu: sempre o mesmo para todos */
const nextHost = (identities: string[]) => [...identities].sort()[0] ?? null;

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Divide o desenho em mensagens pequenas (linhas compridas viram pedaços que se encostam) */
function chunkOps(ops: Op[]): Op[][] {
  const pieces: Op[] = [];
  const maxPts = Math.floor(SYNC_CHUNK / 10) & ~1;
  for (const op of ops) {
    if (op.k !== "line" || op.p.length <= maxPts) {
      pieces.push(op);
      continue;
    }
    // O último pedaço fica com o id da linha: os próximos pontos dela continuam nele
    for (let i = 0; i < op.p.length; i += maxPts - 2) {
      const last = i + maxPts >= op.p.length;
      pieces.push({ ...op, id: last ? op.id : `${op.id}~${i}`, p: op.p.slice(i, i + maxPts) });
      if (last) break;
    }
  }
  const out: Op[][] = [[]];
  let size = 0;
  for (const op of pieces) {
    const n = JSON.stringify(op).length;
    if (size + n > SYNC_CHUNK && out[out.length - 1].length > 0) {
      out.push([]);
      size = 0;
    }
    out[out.length - 1].push(op);
    size += n;
  }
  return out;
}

const randomId = () => Math.random().toString(36).slice(2, 10);

// ---------- hook ----------

/** O que só o host sabe da vez */
interface HostSecret {
  game: string;
  turn: number;
  options: string[];
  word: string | null;
  revealed: Set<number>;
  used: Set<string>;
}

export function useDrawGame(voice: VoiceRoom) {
  const me = voice.participants.find((p) => p.isLocal)?.identity ?? null;
  const meRef = useRef(me);
  meRef.current = me;
  const peopleRef = useRef(voice.participants);
  peopleRef.current = voice.participants;

  const [game, setGame] = useState<LocalDraw | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const set = (next: LocalDraw | null) => {
    gameRef.current = next;
    setGame(next);
  };
  // Jogos encerrados: mensagem atrasada não traz de volta
  const ended = useRef(new Set<string>());

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const feedKey = useRef(0);
  const pushFeed = (item: FeedBody) => setFeed((f) => [...f.slice(-(MAX_FEED - 1)), { ...item, key: ++feedKey.current }]);

  // Só para você: as opções da sua vez e a palavra (de quem desenha, ou porque acertou)
  const [secret, setSecret] = useState<{ game: string; turn: number; options: string[] | null; word: string | null } | null>(null);
  const host = useRef<HostSecret | null>(null);

  // O desenho da vez (fora do React: muda a cada traço)
  const board = useRef<{ game: string; turn: number; from: string; ops: Op[] }>({ game: "", turn: -1, from: "", ops: [] });
  const boardListeners = useRef(new Set<(e: BoardEvent) => void>());
  const emit = (e: BoardEvent) => boardListeners.current.forEach((l) => l(e));
  // A linha que você está desenhando e os pontos dela que ainda não saíram
  const pending = useRef<{ op: LineOp; p: number[] } | null>(null);

  const send = useCallback((m: DrawMessage, to?: string[]) => voice.sendData(DRAW_TOPIC, m, to), [voice.sendData]);

  const presentIds = () => new Set(peopleRef.current.map((p) => p.identity));
  const nameOf = (id: string | null) =>
    (id && (gameRef.current?.players.find((p) => p.id === id)?.name ?? peopleRef.current.find((p) => p.identity === id)?.name)) || "Alguém";

  /** O estado para mandar: com o tempo que falta agora */
  const wire = (s: LocalDraw): DrawState => {
    const { at: _at, ...rest } = s;
    return { ...rest, left: Math.round(remaining(s)) };
  };

  const resetLocal = () => {
    setFeed([]);
    setSecret(null);
    pending.current = null;
    board.current = { game: "", turn: -1, from: "", ops: [] };
    emit({ kind: "reset" });
  };

  /** O quadro é desta vez e de quem desenha? Vez nova: começa em branco */
  const boardFor = (gameId: string, turn: number, from: string): boolean => {
    if (gameRef.current?.id !== gameId) return false;
    const b = board.current;
    if (b.game === gameId && b.turn === turn) return b.from === from;
    if (b.game === gameId && turn < b.turn) return false;
    board.current = { game: gameId, turn, from, ops: [] };
    emit({ kind: "reset" });
    return true;
  };

  /** Manda para alguém (para você mesmo, entrega aqui) */
  const deliver = (to: string, m: DrawMessage) => {
    if (to === meRef.current) receive(m, to);
    else send(m, [to]);
  };

  // ---------- host ----------

  /** Muda o estado e manda para a sala; ms = duração da nova fase (sem: mantém o tempo) */
  const commit = (patch: Partial<DrawState>, ms?: number) => {
    const cur = gameRef.current;
    if (!cur) return;
    const now = performance.now();
    const next: LocalDraw = { ...cur, ...patch, left: ms ?? remaining(cur, now), at: now, rev: cur.rev + 1 };
    set(next);
    send({ t: "state", s: wire(next) });
  };

  const secretOf = (s: LocalDraw) => {
    if (host.current?.game !== s.id) host.current = { game: s.id, turn: -1, options: [], word: null, revealed: new Set(), used: new Set() };
    return host.current;
  };

  const finish = () => commit({ phase: "end", drawer: null, hint: null }, 0);

  const nextTurn = () => {
    const s = gameRef.current;
    if (!s || s.host !== meRef.current) return;
    const present = presentIds();
    const here = s.players.filter((p) => present.has(p.id));
    if (here.length < 2) return finish();
    let round = s.round;
    let drawn = s.drawn;
    let drawer = here.find((p) => !drawn.includes(p.id));
    if (!drawer) {
      round += 1;
      drawn = [];
      drawer = here[0];
    }
    if (round > s.settings.rounds) return finish();
    const h = secretOf(s);
    const turn = s.turn + 1;
    h.turn = turn;
    h.options = pickWords(3, h.used);
    h.word = null;
    h.revealed = new Set();
    commit(
      { phase: "choosing", round, drawn: [...drawn, drawer.id], drawer: drawer.id, turn, hint: null, guessed: [], word: null, gained: {} },
      CHOOSE_MS,
    );
    deliver(drawer.id, { t: "options", id: s.id, turn, words: h.options });
  };

  const hostPick = (i: number) => {
    const s = gameRef.current;
    const h = host.current;
    if (!s || !s.drawer || s.phase !== "choosing" || h?.game !== s.id || h.turn !== s.turn) return;
    const word = h.options[i] ?? h.options[0];
    h.word = word;
    h.used.add(word);
    h.revealed = new Set();
    commit({ phase: "drawing", hint: maskWord(word), gained: {} }, s.settings.seconds * 1000);
    deliver(s.drawer, { t: "word", id: s.id, turn: s.turn, word });
  };

  const endTurn = () => {
    const s = gameRef.current;
    if (!s) return;
    const h = host.current;
    const word = h?.game === s.id && h.turn === s.turn ? h.word : null;
    commit({ phase: "reveal", word, hint: null }, REVEAL_MS);
  };

  const broadcastFeed = (item: FeedBody) => {
    const s = gameRef.current;
    if (!s) return;
    if (item.kind === "hit" && (item.by === meRef.current || s.drawer === meRef.current)) void playCue("hit");
    pushFeed(item);
    send({ t: "feed", id: s.id, item });
  };

  const hostGuess = (from: string, text: string) => {
    const s = gameRef.current;
    const h = host.current;
    if (!s || !s.drawer || s.phase !== "drawing" || h?.game !== s.id || h.turn !== s.turn || !h.word) return;
    if (from === s.drawer || s.guessed.includes(from) || !s.players.some((p) => p.id === from)) return;
    const clean = text.trim().slice(0, 60);
    if (!clean) return;
    if (normalize(clean) === normalize(h.word)) {
      const pts = guessPoints(s.guessed.length);
      const drawer = s.drawer;
      commit({
        guessed: [...s.guessed, from],
        players: s.players.map((p) =>
          p.id === from ? { ...p, score: p.score + pts } : p.id === drawer ? { ...p, score: p.score + DRAWER_POINTS } : p,
        ),
        gained: { ...s.gained, [from]: (s.gained[from] ?? 0) + pts, [drawer]: (s.gained[drawer] ?? 0) + DRAWER_POINTS },
      });
      broadcastFeed({ kind: "hit", by: from });
      deliver(from, { t: "word", id: s.id, turn: s.turn, word: h.word });
    } else {
      broadcastFeed({ kind: "guess", by: from, text: clean });
      if (isClose(clean, h.word)) deliver(from, { t: "feed", id: s.id, item: { kind: "close", text: clean } });
    }
  };

  /** Relógio do host: tempo, dicas, quem entrou e quem saiu */
  const hostTick = () => {
    const s = gameRef.current;
    if (!s || s.host !== meRef.current || s.phase === "end") return;
    const people = peopleRef.current;
    const present = new Set(people.map((p) => p.identity));

    // Chegou alguém: entra no jogo (e desenha ainda nesta rodada)
    const fresh = people.filter((p) => !s.players.some((pl) => pl.id === p.identity));
    if (fresh.length > 0) return commit({ players: [...s.players, ...fresh.map((p) => ({ id: p.identity, name: p.name, score: 0 }))] });

    if (s.players.filter((p) => present.has(p.id)).length < 2) return finish();

    const h = host.current;
    const mine = h?.game === s.id && h.turn === s.turn ? h : null;
    if (s.phase === "choosing" || s.phase === "drawing") {
      // Quem desenhava saiu, ou você assumiu no meio da vez (sem a palavra): passa a vez
      if (!s.drawer || !present.has(s.drawer) || !mine || (s.phase === "drawing" && !mine.word)) return endTurn();
    }
    const rem = remaining(s);

    if (s.phase === "drawing" && mine?.word) {
      const guessers = s.players.filter((p) => present.has(p.id) && p.id !== s.drawer);
      if (guessers.length > 0 && guessers.every((p) => s.guessed.includes(p.id))) return endTurn();
      // Dicas: uma letra na metade do tempo, outra aos 75% (no máximo um terço da palavra)
      const done = 1 - rem / (s.settings.seconds * 1000);
      const letters = [...mine.word].flatMap((ch, i) => (isLetter(ch) && !mine.revealed.has(i) ? [i] : []));
      const max = Math.floor((letters.length + mine.revealed.size) / 3);
      const want = Math.min(done >= 0.75 ? 2 : done >= 0.5 ? 1 : 0, max);
      if (mine.revealed.size < want && letters.length > 0) {
        mine.revealed.add(letters[Math.floor(Math.random() * letters.length)]);
        return commit({ hint: maskWord(mine.word, mine.revealed) });
      }
    }

    if (rem > 0) return;
    if (s.phase === "choosing") hostPick(Math.floor(Math.random() * 3));
    else if (s.phase === "drawing") endTurn();
    else if (s.phase === "reveal") nextTurn();
  };

  // ---------- quem desenha ----------

  const flush = () => {
    const pd = pending.current;
    const s = gameRef.current;
    if (!pd || !s || pd.p.length === 0) return;
    send({ t: "pts", id: s.id, turn: s.turn, op: pd.op.id, p: pd.p });
    pd.p = [];
  };

  /** Manda o desenho todo para quem chegou agora */
  const syncTo = (to: string) => {
    const s = gameRef.current;
    const b = board.current;
    if (!s || b.game !== s.id || b.turn !== s.turn || b.from !== meRef.current) return;
    flush();
    chunkOps(b.ops).forEach((ops, i) => send({ t: "ops", id: s.id, turn: s.turn, ops, first: i === 0 }, [to]));
  };

  // ---------- mensagens ----------

  function receive(m: DrawMessage, from: string) {
    const s = gameRef.current;
    const self = meRef.current;
    switch (m.t) {
      case "state": {
        if (m.s.host !== from || ended.current.has(m.s.id)) return;
        if (s && !replaces(m.s, s)) return;
        if (s?.id !== m.s.id) resetLocal();
        set({ ...m.s, at: performance.now() });
        return;
      }
      case "end":
        ended.current.add(m.id);
        if (s?.id === m.id) {
          set(null);
          resetLocal();
        }
        return;
      case "hello":
        if (!s || from === self) return;
        if (s.host === self) send({ t: "state", s: wire(s) }, [from]);
        if (s.drawer === self) syncTo(from);
        return;
    }
    if (!s || m.id !== s.id) return;
    switch (m.t) {
      case "options":
        if (from === s.host) setSecret({ game: m.id, turn: m.turn, options: m.words, word: null });
        return;
      case "word":
        if (from !== s.host) return;
        setSecret((cur) => ({ game: m.id, turn: m.turn, options: cur?.game === m.id && cur.turn === m.turn ? cur.options : null, word: m.word }));
        return;
      case "feed":
        if (from !== s.host) return;
        if (m.item.kind === "hit" && (m.item.by === self || s.drawer === self)) void playCue("hit");
        pushFeed(m.item);
        return;
      case "pick":
        if (s.host === self && from === s.drawer && m.turn === s.turn) hostPick(m.i);
        return;
      case "guess":
        if (s.host === self && m.turn === s.turn) hostGuess(from, m.text);
        return;
      case "op":
        if (!boardFor(m.id, m.turn, from)) return;
        board.current.ops.push(m.op);
        emit({ kind: "op", op: m.op });
        return;
      case "pts": {
        if (!boardFor(m.id, m.turn, from)) return;
        const ops = board.current.ops;
        for (let i = ops.length - 1; i >= 0; i--) {
          const op = ops[i];
          if (op.k === "line" && op.id === m.op) {
            const start = op.p.length;
            op.p.push(...m.p);
            emit({ kind: "pts", op, from: start });
            return;
          }
        }
        return;
      }
      case "undo":
        if (!boardFor(m.id, m.turn, from)) return;
        board.current.ops.pop();
        emit({ kind: "reset" });
        return;
      case "clear":
        if (!boardFor(m.id, m.turn, from)) return;
        board.current.ops = [];
        emit({ kind: "reset" });
        return;
      case "ops":
        if (!boardFor(m.id, m.turn, from)) return;
        board.current.ops = m.first ? [...m.ops] : [...board.current.ops, ...m.ops];
        emit({ kind: "reset" });
        return;
    }
  }

  // As funções acima mudam a cada render; listeners e relógios chamam a mais nova
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  const tickRef = useRef(hostTick);
  tickRef.current = hostTick;
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(
    () =>
      voice.onData((topic, data, from) => {
        if (topic === DRAW_TOPIC) receiveRef.current(data as DrawMessage, from);
      }),
    [voice.onData],
  );

  // Entrou na chamada: pergunta se tem jogo rolando
  useEffect(() => {
    if (voice.connection !== ConnectionState.Connected) return;
    const timer = setTimeout(() => send({ t: "hello" }), 1000);
    return () => clearTimeout(timer);
  }, [voice.connection, voice.room, send]);

  // O host saiu da chamada: outra pessoa assume (a mesma em todos os PCs)
  const ids = voice.participants.map((p) => p.identity).sort().join(",");
  useEffect(() => {
    const s = gameRef.current;
    if (!s || !ids) return;
    const list = ids.split(",");
    if (list.includes(s.host)) return;
    const players = list.filter((id) => s.players.some((p) => p.id === id));
    const next = nextHost(players.length > 0 ? players : list);
    if (next) set({ ...s, host: next });
  }, [ids, game?.host]);

  const isHost = !!game && !!me && game.host === me;
  useEffect(() => {
    if (!isHost) return;
    const timer = setInterval(() => tickRef.current(), 250);
    return () => clearInterval(timer);
  }, [isHost]);

  const isDrawer = !!game && !!me && game.drawer === me && game.phase === "drawing";
  useEffect(() => {
    if (!isDrawer) {
      pending.current = null;
      return;
    }
    const timer = setInterval(() => flushRef.current(), FLUSH_MS);
    return () => clearInterval(timer);
  }, [isDrawer]);

  // Saiu da chamada (ou trocou de sala): acaba o jogo aqui
  const lastRoom = useRef(voice.room);
  useEffect(() => {
    if (lastRoom.current === voice.room) return;
    lastRoom.current = voice.room;
    set(null);
    resetLocal();
  }, [voice.room]);

  // Avisos no chat do jogo: de quem é a vez e qual era a palavra
  const phaseKey = game ? `${game.id}:${game.turn}:${game.phase}` : "";
  useEffect(() => {
    const s = gameRef.current;
    if (!s) return;
    if (s.phase === "choosing") pushFeed({ kind: "info", text: s.drawer === meRef.current ? "Sua vez de desenhar!" : `Vez de ${nameOf(s.drawer)} desenhar` });
    else if (s.phase === "reveal" && s.word) pushFeed({ kind: "info", text: `A palavra era ${s.word.toUpperCase()}` });
    else if (s.phase === "end") pushFeed({ kind: "info", text: "Fim de jogo!" });
  }, [phaseKey]);

  // ---------- ações ----------

  /** Começa um jogo novo com todo mundo da chamada (você conduz) */
  const start = (settings: DrawSettings) => {
    const self = meRef.current;
    if (!self) return;
    const players = shuffle(peopleRef.current.map((p) => ({ id: p.identity, name: p.name, score: 0 })));
    const s: LocalDraw = {
      id: crypto.randomUUID(),
      host: self,
      started: Date.now(),
      settings,
      players,
      round: 1,
      drawn: [],
      turn: 0,
      drawer: null,
      phase: "reveal",
      left: 0,
      hint: null,
      guessed: [],
      word: null,
      gained: {},
      rev: 0,
      at: performance.now(),
    };
    resetLocal();
    set(s);
    nextTurn();
  };

  /** Encerra para todo mundo */
  const end = () => {
    const s = gameRef.current;
    if (!s) return;
    ended.current.add(s.id);
    send({ t: "end", id: s.id });
    set(null);
    resetLocal();
  };

  /** Quem desenha escolhe a palavra */
  const pick = (i: number) => {
    const s = gameRef.current;
    if (!s || s.drawer !== meRef.current || s.phase !== "choosing") return;
    if (s.host === meRef.current) hostPick(i);
    else send({ t: "pick", id: s.id, turn: s.turn, i }, [s.host]);
  };

  const guess = (text: string) => {
    const s = gameRef.current;
    const self = meRef.current;
    if (!s || !self || s.phase !== "drawing" || !text.trim()) return;
    if (s.host === self) hostGuess(self, text);
    else send({ t: "guess", id: s.id, turn: s.turn, text: text.slice(0, 60) }, [s.host]);
  };

  const canDraw = () => {
    const s = gameRef.current;
    return !!s && s.phase === "drawing" && s.drawer === meRef.current;
  };

  /** O seu quadro desta vez (cria se ainda não existe) */
  const myBoard = () => {
    const s = gameRef.current!;
    boardFor(s.id, s.turn, meRef.current!);
    return board.current;
  };

  const draw = {
    begin(c: string, w: number, x: number, y: number) {
      if (!canDraw()) return;
      flush();
      const s = gameRef.current!;
      const op: LineOp = { k: "line", id: randomId(), c, w, p: [x, y] };
      myBoard().ops.push(op);
      emit({ kind: "op", op });
      send({ t: "op", id: s.id, turn: s.turn, op });
      pending.current = { op, p: [] };
    },
    move(x: number, y: number) {
      const pd = pending.current;
      if (!pd || !canDraw()) return;
      const p = pd.op.p;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 2) return;
      const from = p.length;
      p.push(x, y);
      pd.p.push(x, y);
      emit({ kind: "pts", op: pd.op, from });
    },
    end() {
      flush();
      pending.current = null;
    },
    fill(c: string, x: number, y: number) {
      if (!canDraw()) return;
      const s = gameRef.current!;
      const op: FillOp = { k: "fill", id: randomId(), c, x, y };
      myBoard().ops.push(op);
      emit({ kind: "op", op });
      send({ t: "op", id: s.id, turn: s.turn, op });
    },
    undo() {
      if (!canDraw()) return;
      flush();
      pending.current = null;
      const b = myBoard();
      if (b.ops.length === 0) return;
      b.ops.pop();
      emit({ kind: "reset" });
      const s = gameRef.current!;
      send({ t: "undo", id: s.id, turn: s.turn });
    },
    clear() {
      if (!canDraw()) return;
      pending.current = null;
      const b = myBoard();
      if (b.ops.length === 0) return;
      b.ops = [];
      emit({ kind: "reset" });
      const s = gameRef.current!;
      send({ t: "clear", id: s.id, turn: s.turn });
    },
  };

  /** O desenho que aparece agora (o da vez, de quem desenha) */
  const visibleOps = (): Op[] => {
    const s = gameRef.current;
    const b = board.current;
    return s && b.game === s.id && b.turn === s.turn && b.from === s.drawer ? b.ops : [];
  };

  const onBoard = useCallback((listener: (e: BoardEvent) => void) => {
    boardListeners.current.add(listener);
    return () => void boardListeners.current.delete(listener);
  }, []);

  const mySecret = secret && game && secret.game === game.id && secret.turn === game.turn ? secret : null;

  return {
    game,
    me,
    isHost,
    feed,
    /** As 3 opções, na sua vez de escolher */
    options: game?.phase === "choosing" && game.drawer === me ? (mySecret?.options ?? null) : null,
    /** A palavra: sua vez de desenhar, ou você acertou */
    word: mySecret?.word ?? null,
    start,
    end,
    pick,
    guess,
    draw,
    visibleOps,
    onBoard,
  };
}

export type DrawGame = ReturnType<typeof useDrawGame>;
