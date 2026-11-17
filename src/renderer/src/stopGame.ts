import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState } from "livekit-client";
import type { VoiceRoom } from "./useVoiceRoom";
import { normalize } from "./drawGame";
import { nextHost } from "./cinema";
import { playCue } from "./sounds";

/**
 * Stop (Adedonha): sorteia uma letra e cada um preenche as categorias. Quem
 * terminar aperta STOP e todo mundo para depois de 3 segundos. Na correção, a
 * turma vota para anular respostas. Quem começa conduz ("host"): sorteia,
 * conta o tempo, junta as respostas, soma os pontos e manda o estado para
 * todos, pelo canal de dados da chamada (como o Desenha e Adivinha).
 */

export const STOP_TOPIC = "toca.stop";
/** Aviso entre o STOP e as respostas travarem */
const STOP_GRACE_MS = 3_000;
/** Depois do aviso, quanto o host espera as respostas chegarem */
const COLLECT_MS = 2_500;
/** Letras sorteadas (sem K, Q, W, X, Y e Z, que travam a rodada) */
const LETTERS = "ABCDEFGHIJLMNOPRSTUV";

export const STOP_CATEGORIES = [
  "Nome",
  "Animal",
  "Cidade, estado ou país",
  "Comida",
  "Fruta",
  "Cor",
  "Objeto",
  "Profissão",
  "Marca",
  "Filme ou série",
  "Parte do corpo",
  "Esporte",
  "Personagem",
  "Minha sogra é…",
];

export interface StopSettings {
  rounds: number;
  /** Tempo máximo de cada rodada, em segundos */
  seconds: number;
  categories: string[];
}

export const DEFAULT_STOP: StopSettings = {
  rounds: 5,
  seconds: 120,
  categories: ["Nome", "Animal", "Cidade, estado ou país", "Comida", "Cor", "Objeto", "Profissão", "Marca"],
};

export interface StopPlayer {
  id: string;
  name: string;
  score: number;
  /** Joga esta rodada (quem saiu da chamada fica com os pontos, fora da rodada) */
  active: boolean;
}

export type StopPhase = "writing" | "stopping" | "review" | "end";

export interface StopState {
  id: string;
  host: string;
  /** Relógio de quem começou: dois jogos ao mesmo tempo, o mais novo vale */
  started: number;
  settings: StopSettings;
  /** Todo mundo que já jogou; quem chega no meio entra na próxima rodada */
  players: StopPlayer[];
  round: number;
  letter: string;
  /** Letras já sorteadas */
  used: string[];
  phase: StopPhase;
  /** Quem apertou STOP (null: acabou o tempo) */
  stoppedBy: string | null;
  /** Quanto faltava (ms) da fase quando o host mandou */
  left: number;
  /** Respostas de cada um, na ordem das categorias (na correção e no fim) */
  answers: Record<string, string[]>;
  /** "jogador:categoria" → quem votou para anular */
  votes: Record<string, string[]>;
  rev: number;
}

export type LocalStop = StopState & { at: number };

type StopMessage =
  | { t: "state"; s: StopState }
  | { t: "end"; id: string }
  | { t: "hello" }
  | { t: "stop"; id: string; round: number }
  | { t: "answers"; id: string; round: number; list: string[] }
  | { t: "vote"; id: string; round: number; key: string; on: boolean };

// ---------- regras (sem React) ----------

const replaces = (a: StopState, b: StopState) =>
  a.id !== b.id ? a.started > b.started || (a.started === b.started && a.id > b.id) : a.rev > b.rev;

export const voteKey = (player: string, category: number) => `${player}:${category}`;

/** Começa com a letra da rodada (sem acento: "Ágata" vale no A) */
export const startsWith = (answer: string, letter: string) => normalize(answer).startsWith(letter.toLowerCase());

/** Quem joga a rodada */
export const activePlayers = (s: StopState) => s.players.filter((p) => p.active);

/** Anulada pela turma: metade ou mais dos outros jogadores votou */
export function annulled(s: StopState, player: string, category: number): boolean {
  const voters = Math.max(1, activePlayers(s).length - 1);
  return (s.votes[voteKey(player, category)]?.length ?? 0) >= Math.ceil(voters / 2);
}

/** Pontos de cada resposta: 10 só você, 5 repetida, 0 vazia, outra letra ou anulada */
export function roundScores(s: StopState): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const valid = (id: string, c: number) => {
    const a = s.answers[id]?.[c] ?? "";
    return normalize(a) !== "" && startsWith(a, s.letter) && !annulled(s, id, c);
  };
  const active = activePlayers(s);
  for (const p of active) {
    out[p.id] = s.settings.categories.map((_, c) => {
      if (!valid(p.id, c)) return 0;
      const mine = normalize(s.answers[p.id][c]);
      const repeated = active.some((o) => o.id !== p.id && valid(o.id, c) && normalize(s.answers[o.id][c]) === mine);
      return repeated ? 5 : 10;
    });
  }
  return out;
}

export const sumRound = (s: StopState, id: string) => (roundScores(s)[id] ?? []).reduce((a, b) => a + b, 0);

function drawLetter(used: string[]): string {
  const free = [...LETTERS].filter((l) => !used.includes(l));
  const pool = free.length ? free : [...LETTERS];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- hook ----------

export function useStopGame(voice: VoiceRoom) {
  const me = voice.participants.find((p) => p.isLocal)?.identity ?? null;
  const meRef = useRef(me);
  meRef.current = me;
  const peopleRef = useRef(voice.participants);
  peopleRef.current = voice.participants;

  const [game, setGame] = useState<LocalStop | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const ended = useRef(new Set<string>());

  // Suas respostas da rodada (só saem do seu PC quando a rodada para)
  const [mine, setMine] = useState<{ key: string; list: string[] }>({ key: "", list: [] });
  const mineRef = useRef(mine);
  mineRef.current = mine;
  // Rodada (e host) para quem você já mandou as respostas
  const sentFor = useRef("");
  // Host: respostas que chegaram nesta rodada
  const collected = useRef<{ key: string; answers: Record<string, string[]> }>({ key: "", answers: {} });

  const send = useCallback((m: StopMessage, to?: string[]) => voice.sendData(STOP_TOPIC, m, to), [voice.sendData]);

  const adopt = useCallback((s: StopState) => {
    if (ended.current.has(s.id)) return;
    const cur = gameRef.current;
    if (cur && !replaces(s, cur)) return;
    const next = { ...s, at: performance.now() };
    gameRef.current = next;
    setGame(next);
  }, []);

  /** Host: muda o estado e manda para todos */
  const publish = (patch: Partial<StopState>) => {
    const cur = gameRef.current;
    if (!cur) return;
    const { at: _at, ...base } = cur;
    const s: StopState = { ...base, ...patch, rev: cur.rev + 1 };
    adopt(s);
    send({ t: "state", s });
  };

  const isHost = !!game && game.host === me;
  const roundKey = game ? `${game.id}:${game.round}` : "";

  // Rodada nova: as suas respostas começam em branco
  useEffect(() => {
    if (game && mineRef.current.key !== roundKey) setMine({ key: roundKey, list: game.settings.categories.map(() => "") });
  }, [roundKey]);

  /** Restante da fase (ms) */
  const remaining = (s: LocalStop | null = gameRef.current) => (s ? Math.max(0, s.left - (performance.now() - s.at)) : 0);

  // ---------- host ----------

  const hostStop = (by: string | null) => {
    const cur = gameRef.current;
    if (!cur || cur.phase !== "writing") return;
    publish({ phase: "stopping", stoppedBy: by, left: STOP_GRACE_MS });
  };

  const hostReview = () => {
    const cur = gameRef.current;
    if (!cur || cur.phase !== "stopping") return;
    const got = collected.current.key === `${cur.id}:${cur.round}` ? collected.current.answers : {};
    const answers = Object.fromEntries(activePlayers(cur).map((p) => [p.id, got[p.id] ?? cur.settings.categories.map(() => "")]));
    publish({ phase: "review", answers, votes: {}, left: 0 });
  };

  /** Soma a rodada e começa a próxima (ou mostra o resultado) */
  const next = () => {
    const cur = gameRef.current;
    if (!cur || cur.host !== meRef.current || cur.phase !== "review") return;
    const scores = roundScores(cur);
    const totals = cur.players.map((p) => ({ ...p, score: p.score + (scores[p.id] ?? []).reduce((a, b) => a + b, 0) }));
    if (cur.round >= cur.settings.rounds) {
      publish({ phase: "end", players: totals, left: 0 });
      return;
    }
    // Quem chegou no meio entra agora; quem saiu fica com os pontos, fora da rodada
    const here = peopleRef.current;
    const players = [
      ...totals.map((p) => ({ ...p, active: here.some((h) => h.identity === p.id) })),
      ...here.filter((h) => !totals.some((p) => p.id === h.identity)).map((h) => ({ id: h.identity, name: h.name, score: 0, active: true })),
    ];
    const letter = drawLetter(cur.used);
    publish({
      phase: "writing",
      round: cur.round + 1,
      letter,
      used: [...cur.used, letter],
      players,
      stoppedBy: null,
      left: cur.settings.seconds * 1000,
      answers: {},
      votes: {},
    });
  };

  // Relógio do host: fim do tempo da rodada, fim do aviso do STOP e espera das respostas
  useEffect(() => {
    if (!isHost || !game) return;
    if (game.phase === "writing") {
      const timer = setTimeout(() => hostStop(null), remaining(game));
      return () => clearTimeout(timer);
    }
    if (game.phase === "stopping") {
      const timer = setTimeout(hostReview, remaining(game) + COLLECT_MS);
      return () => clearTimeout(timer);
    }
  }, [isHost, game?.id, game?.rev, game?.phase]);

  // Host: já chegaram as respostas de todo mundo? Não precisa esperar
  const tryEarlyReview = () => {
    const cur = gameRef.current;
    if (!cur || cur.host !== meRef.current || cur.phase !== "stopping" || remaining(cur) > 0) return;
    const got = collected.current.answers;
    const here = new Set(peopleRef.current.map((p) => p.identity));
    if (activePlayers(cur).filter((p) => here.has(p.id)).every((p) => got[p.id])) hostReview();
  };

  // ---------- todos ----------

  // Quando a rodada para: manda as suas respostas (de novo, se o host mudou)
  useEffect(() => {
    if (!game || game.phase !== "stopping" || !me || !activePlayers(game).some((p) => p.id === me)) return;
    const key = `${game.id}:${game.round}:${game.host}`;
    if (sentFor.current === key) return;
    const timer = setTimeout(() => {
      const cur = gameRef.current;
      if (!cur || cur.phase !== "stopping") return;
      sentFor.current = key;
      const list = mineRef.current.key === `${cur.id}:${cur.round}` ? mineRef.current.list : [];
      if (cur.host === meRef.current) receiveAnswers(me, cur.round, list);
      else send({ t: "answers", id: cur.id, round: cur.round, list }, [cur.host]);
    }, remaining(game));
    return () => clearTimeout(timer);
  }, [game?.id, game?.round, game?.phase, game?.host, game?.rev, me]);

  const receiveAnswers = (from: string, round: number, list: string[]) => {
    const cur = gameRef.current;
    if (!cur || cur.host !== meRef.current || cur.round !== round || cur.phase !== "stopping") return;
    if (!activePlayers(cur).some((p) => p.id === from)) return;
    const key = `${cur.id}:${cur.round}`;
    if (collected.current.key !== key) collected.current = { key, answers: {} };
    collected.current.answers[from] = cur.settings.categories.map((_, i) => String(list[i] ?? "").slice(0, 60));
    tryEarlyReview();
  };

  // Som e aviso quando alguém aperta STOP
  const lastPhase = useRef<string>("");
  useEffect(() => {
    if (!game) return;
    const key = `${game.id}:${game.round}:${game.phase}`;
    if (lastPhase.current === key) return;
    lastPhase.current = key;
    if (game.phase === "stopping" || game.phase === "end") void playCue("hit");
  }, [game?.id, game?.round, game?.phase]);

  function receive(m: StopMessage, from: string) {
    const cur = gameRef.current;
    switch (m.t) {
      case "state":
        if (m.s.host === from) adopt(m.s);
        return;
      case "end":
        ended.current.add(m.id);
        if (cur?.id === m.id) setGame((gameRef.current = null));
        return;
      case "hello":
        if (cur && cur.host === meRef.current && from !== meRef.current) {
          const { at: _at, ...s } = cur;
          send({ t: "state", s: { ...s, left: remaining(cur) } }, [from]);
        }
        return;
      case "stop":
        if (cur && cur.id === m.id && cur.round === m.round && cur.host === meRef.current && activePlayers(cur).some((p) => p.id === from)) hostStop(from);
        return;
      case "answers":
        if (cur && cur.id === m.id) receiveAnswers(from, m.round, m.list);
        return;
      case "vote":
        if (!cur || cur.id !== m.id || cur.round !== m.round || cur.host !== meRef.current || cur.phase !== "review") return;
        applyVote(from, m.key, m.on);
        return;
    }
  }

  const applyVote = (from: string, key: string, on: boolean) => {
    const cur = gameRef.current;
    if (!cur || !activePlayers(cur).some((p) => p.id === from) || key.startsWith(`${from}:`)) return;
    const list = cur.votes[key] ?? [];
    const nextList = on ? [...new Set([...list, from])] : list.filter((v) => v !== from);
    publish({ votes: { ...cur.votes, [key]: nextList } });
  };

  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  useEffect(
    () =>
      voice.onData((topic, data, from) => {
        if (topic === STOP_TOPIC) receiveRef.current(data as StopMessage, from);
      }),
    [voice.onData],
  );

  // Entrou na chamada: pergunta se tem jogo rolando
  useEffect(() => {
    if (voice.connection !== ConnectionState.Connected) return;
    const timer = setTimeout(() => send({ t: "hello" }), 1200);
    return () => clearTimeout(timer);
  }, [voice.connection, voice.room, send]);

  // Saiu da chamada (ou trocou de sala): acaba o jogo aqui
  const lastRoom = useRef(voice.room);
  useEffect(() => {
    if (lastRoom.current === voice.room) return;
    lastRoom.current = voice.room;
    setGame((gameRef.current = null));
  }, [voice.room]);

  // Quem conduzia saiu: outro jogador assume (o mesmo em todos os PCs)
  const ids = voice.participants.map((p) => p.identity).sort().join(",");
  useEffect(() => {
    const cur = gameRef.current;
    if (!cur || !ids) return;
    const here = ids.split(",");
    if (here.includes(cur.host)) return;
    const host = nextHost(activePlayers(cur).map((p) => p.id).filter((id) => here.includes(id)));
    if (!host) return;
    const nextState = { ...cur, host, at: performance.now(), left: remaining(cur) };
    gameRef.current = nextState;
    setGame(nextState);
    if (host === meRef.current) {
      const { at: _at, ...s } = nextState;
      publish({ ...s, host });
    }
  }, [ids]);

  // ---------- ações ----------

  const start = (settings: StopSettings) => {
    const self = meRef.current;
    if (!self) return;
    const letter = drawLetter([]);
    const s: StopState = {
      id: crypto.randomUUID(),
      host: self,
      started: Date.now(),
      settings,
      players: peopleRef.current.map((p) => ({ id: p.identity, name: p.name, score: 0, active: true })),
      round: 1,
      letter,
      used: [letter],
      phase: "writing",
      stoppedBy: null,
      left: settings.seconds * 1000,
      answers: {},
      votes: {},
      rev: 1,
    };
    gameRef.current = null;
    adopt(s);
    send({ t: "state", s });
  };

  /** Apertou STOP (precisa ter preenchido tudo) */
  const stop = () => {
    const cur = gameRef.current;
    const self = meRef.current;
    if (!cur || !self || cur.phase !== "writing") return;
    if (cur.host === self) hostStop(self);
    else send({ t: "stop", id: cur.id, round: cur.round }, [cur.host]);
  };

  const setAnswer = (i: number, value: string) => {
    const cur = gameRef.current;
    if (!cur || (cur.phase !== "writing" && !(cur.phase === "stopping" && remaining(cur) > 0))) return;
    setMine((m) => (m.key === `${cur.id}:${cur.round}` ? { ...m, list: m.list.map((v, j) => (j === i ? value.slice(0, 60) : v)) } : m));
  };

  /** Votar para anular a resposta de alguém (de novo: tira o voto) */
  const vote = (player: string, category: number, on: boolean) => {
    const cur = gameRef.current;
    const self = meRef.current;
    if (!cur || !self || cur.phase !== "review" || player === self) return;
    const key = voteKey(player, category);
    if (cur.host === self) applyVote(self, key, on);
    else send({ t: "vote", id: cur.id, round: cur.round, key, on }, [cur.host]);
  };

  /** Encerra para todo mundo */
  const end = () => {
    const cur = gameRef.current;
    if (!cur) return;
    ended.current.add(cur.id);
    send({ t: "end", id: cur.id });
    setGame((gameRef.current = null));
  };

  return {
    game,
    me,
    isHost,
    /** Você joga esta rodada? (quem chegou no meio entra na próxima) */
    playing: !!game && !!me && activePlayers(game).some((p) => p.id === me),
    answers: game && mine.key === roundKey ? mine.list : [],
    remaining: () => remaining(),
    start,
    stop,
    setAnswer,
    vote,
    next,
    end,
  };
}

export type StopGame = ReturnType<typeof useStopGame>;
