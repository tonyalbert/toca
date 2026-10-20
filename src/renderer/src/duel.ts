import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState } from "livekit-client";
import type { VoiceRoom } from "./useVoiceRoom";
import { DUEL_RULES, type DuelKind } from "./duelRules";

/**
 * Jogos de 2 (Lig 4, Batalha Naval, Cara a Cara). Cada jogada é um evento que
 * vai para a sala inteira, e todo mundo aplica os mesmos eventos com as mesmas
 * regras: o estado sai igual em todos os PCs, sem ninguém conduzindo. Quem
 * guarda um segredo (os navios, o personagem) responde sozinho às jogadas que
 * dependem dele (o tiro, o chute). Quem não está jogando assiste.
 */

export const DUEL_TOPIC = "toca.duelo";
/** Eventos por mensagem ao mandar o jogo para quem chegou */
const SYNC_CHUNK = 120;

export interface DuelSession {
  /** Muda a cada partida */
  id: string;
  kind: DuelKind;
  /** players[0] começa */
  players: [string, string];
  names: [string, string];
  /** Relógio de quem começou: duas partidas ao mesmo tempo, a mais nova vale */
  started: number;
  /** Sorteios iguais em todos os PCs (ex.: os personagens do Cara a Cara) */
  seed: number;
}

/** Uma jogada: n conta as jogadas de quem mandou (by + n identificam) */
export interface DuelEvent {
  by: string;
  n: number;
  e: unknown;
}

type DuelMessage =
  | { t: "start"; s: DuelSession }
  | { t: "end"; id: string }
  | { t: "hello" }
  | { t: "ev"; id: string; ev: DuelEvent }
  | { t: "sync"; s: DuelSession; events: DuelEvent[]; first: boolean };

export type Seat = 0 | 1;

/** A partida aqui: o estado das regras e os eventos já aplicados, na ordem */
interface Local {
  session: DuelSession;
  state: unknown;
  applied: DuelEvent[];
  /** Chegaram antes da jogada de que dependem: tentam de novo a cada evento */
  waiting: DuelEvent[];
  seen: Set<string>;
}

const replaces = (a: DuelSession, b: DuelSession) => a.started > b.started || (a.started === b.started && a.id > b.id);

export function useDuel(voice: VoiceRoom) {
  const me = voice.participants.find((p) => p.isLocal)?.identity ?? null;
  const meRef = useRef(me);
  meRef.current = me;
  const peopleRef = useRef(voice.participants);
  peopleRef.current = voice.participants;

  const local = useRef<Local | null>(null);
  // Re-render a cada mudança (o estado mora no ref)
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const ended = useRef(new Set<string>());
  // Começa no relógio: quem recarregou o app não repete o número de uma jogada antiga
  const counter = useRef(Date.now());

  // O seu segredo e as suas anotações (cartas viradas etc.) nesta partida
  const secret = useRef<{ id: string; value: unknown } | null>(null);
  const [scratch, setScratchState] = useState<{ id: string; value: unknown } | null>(null);

  const send = useCallback((m: DuelMessage, to?: string[]) => voice.sendData(DUEL_TOPIC, m, to), [voice.sendData]);

  const seatOf = (s: DuelSession, id: string | null): Seat | null => (id === s.players[0] ? 0 : id === s.players[1] ? 1 : null);

  /** Aplica o que der (o evento novo e os que estavam esperando) */
  const ingest = (events: DuelEvent[]) => {
    const l = local.current;
    if (!l) return;
    const rules = DUEL_RULES[l.session.kind];
    for (const ev of events) {
      const key = `${ev.by}:${ev.n}`;
      if (l.seen.has(key)) continue;
      l.seen.add(key);
      l.waiting.push(ev);
    }
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < l.waiting.length; i++) {
        const ev = l.waiting[i];
        const seat = seatOf(l.session, ev.by);
        const next = seat === null ? null : rules.apply(l.state, ev.e, seat, l.session);
        if (next === null) continue;
        l.state = next;
        l.applied.push(ev);
        l.waiting.splice(i, 1);
        progress = true;
        break;
      }
    }
    bump();
    respond();
  };

  /** Quem tem o segredo responde sozinho (tiro, chute, revelar no fim) */
  const respond = () => {
    const l = local.current;
    const seat = l ? seatOf(l.session, meRef.current) : null;
    if (!l || seat === null) return;
    const rules = DUEL_RULES[l.session.kind];
    const mine = secret.current?.id === l.session.id ? secret.current.value : null;
    const answer = rules.respond?.(l.state, seat, mine, l.session);
    if (answer) play(answer);
  };

  /** Faz uma jogada (só sai se valer pelas regras) */
  const play = (e: unknown): boolean => {
    const l = local.current;
    const self = meRef.current;
    if (!l || !self) return false;
    const seat = seatOf(l.session, self);
    if (seat === null || DUEL_RULES[l.session.kind].apply(l.state, e, seat, l.session) === null) return false;
    const ev: DuelEvent = { by: self, n: ++counter.current, e };
    send({ t: "ev", id: l.session.id, ev });
    ingest([ev]);
    return true;
  };

  const adopt = (s: DuelSession, events: DuelEvent[] = []) => {
    if (ended.current.has(s.id)) return;
    const cur = local.current;
    if (cur && cur.session.id !== s.id && !replaces(s, cur.session)) return;
    if (!cur || cur.session.id !== s.id) {
      local.current = { session: s, state: DUEL_RULES[s.kind].init(s), applied: [], waiting: [], seen: new Set() };
      const seat = seatOf(s, meRef.current);
      const make = DUEL_RULES[s.kind].initSecret;
      if (seat !== null && make && secret.current?.id !== s.id) secret.current = { id: s.id, value: make(s, seat) };
    }
    ingest(events);
  };

  const clear = () => {
    local.current = null;
    bump();
  };

  function receive(m: DuelMessage, from: string) {
    const l = local.current;
    switch (m.t) {
      case "start":
        if (m.s.players.includes(from)) adopt(m.s);
        return;
      case "end":
        ended.current.add(m.id);
        if (l?.session.id === m.id) clear();
        return;
      case "ev":
        if (l?.session.id === m.id && m.ev.by === from) ingest([m.ev]);
        return;
      case "sync":
        if (!m.s.players.includes(from)) return;
        if (!l || l.session.id !== m.s.id) adopt(m.s, m.events);
        else ingest(m.events);
        return;
      case "hello": {
        // Quem chegou recebe a partida de um dos jogadores (o primeiro que estiver na chamada)
        if (!l || from === meRef.current) return;
        const here = new Set(peopleRef.current.map((p) => p.identity));
        const sender = l.session.players.find((id) => here.has(id));
        if (sender !== meRef.current) return;
        const { applied } = l;
        for (let i = 0; i === 0 || i < applied.length; i += SYNC_CHUNK)
          send({ t: "sync", s: l.session, events: applied.slice(i, i + SYNC_CHUNK), first: i === 0 }, [from]);
        return;
      }
    }
  }

  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  useEffect(
    () =>
      voice.onData((topic, data, from) => {
        if (topic === DUEL_TOPIC) receiveRef.current(data as DuelMessage, from);
      }),
    [voice.onData],
  );

  // Entrou na chamada: pergunta se tem partida rolando
  useEffect(() => {
    if (voice.connection !== ConnectionState.Connected) return;
    const timer = setTimeout(() => send({ t: "hello" }), 1000);
    return () => clearTimeout(timer);
  }, [voice.connection, voice.room, send]);

  // Saiu da chamada (ou trocou de sala): acaba a partida aqui
  const lastRoom = useRef(voice.room);
  useEffect(() => {
    if (lastRoom.current === voice.room) return;
    lastRoom.current = voice.room;
    clear();
  }, [voice.room]);

  /** Começa uma partida contra alguém (players[0] começa jogando) */
  const start = (kind: DuelKind, players: [string, string]) => {
    const names = players.map((id) => peopleRef.current.find((p) => p.identity === id)?.name ?? "Alguém") as [string, string];
    const s: DuelSession = { id: crypto.randomUUID(), kind, players, names, started: Date.now(), seed: Math.floor(Math.random() * 2 ** 31) };
    local.current = null;
    adopt(s);
    send({ t: "start", s });
  };

  /** Revanche: mesma dupla, quem começou agora espera */
  const rematch = () => {
    const l = local.current;
    if (!l) return;
    start(l.session.kind, [l.session.players[1], l.session.players[0]]);
  };

  /** Encerra para todo mundo */
  const end = () => {
    const l = local.current;
    if (!l) return;
    ended.current.add(l.session.id);
    send({ t: "end", id: l.session.id });
    clear();
  };

  const l = local.current;
  const session = l?.session ?? null;
  const seat = session ? seatOf(session, me) : null;

  /** Guarda o seu segredo (ex.: onde ficaram os navios) */
  const setSecret = (value: unknown) => {
    if (!session) return;
    secret.current = { id: session.id, value };
    bump();
    respond();
  };
  const setScratch = (value: unknown) => session && setScratchState({ id: session.id, value });

  return {
    session,
    state: l?.state ?? null,
    /** Muda a cada jogada (para memo) */
    version,
    me,
    /** Seu lugar no jogo (null: assistindo) */
    seat,
    secret: session && secret.current?.id === session.id ? secret.current.value : null,
    setSecret,
    scratch: session && scratch?.id === session.id ? scratch.value : null,
    setScratch,
    start,
    rematch,
    end,
    play,
  };
}

export type Duel = ReturnType<typeof useDuel>;
