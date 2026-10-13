import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceRoom } from "./useVoiceRoom";

/**
 * Sessão de cinema: a sala assiste junto (YouTube ou um arquivo que cada um
 * abre no próprio PC). Os comandos andam pelo canal de dados da chamada
 * (LiveKit); quem conduz a sessão ("host") também a deixa nos atributos dele,
 * para quem entra no meio, e manda a posição de tempos em tempos para quem
 * atrasou se ajustar.
 */

export type CinemaSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "file"; name: string; size: number; duration: number };

export interface CinemaState {
  /** Muda a cada vídeo novo */
  id: string;
  /** Quem conduz: manda a posição e guarda a sessão nos atributos */
  host: string;
  source: CinemaSource;
  playing: boolean;
  /** Posição (segundos) no momento do comando */
  pos: number;
  /** Conta os comandos: o maior vale */
  rev: number;
  /** Relógio de quem mandou (Date.now), para quem entra no meio */
  wall: number;
  /** Quem deu o comando (desempate) */
  by: string;
}

/** O estado como chegou aqui: at = performance.now() da chegada */
export type LocalCinema = CinemaState & { at: number };

type CinemaMessage =
  | { t: "state"; s: CinemaState }
  | { t: "tick"; id: string; rev: number; pos: number; playing: boolean }
  | { t: "end"; id: string };

export const CINEMA_TOPIC = "toca.cinema";
/** De quanto em quanto tempo quem conduz manda a posição */
const TICK_MS = 3000;

// ---------- regras (sem React) ----------

/** Aceita link do YouTube (watch, youtu.be, shorts, embed, live) ou só o id */
export function parseYouTube(text: string): string | null {
  const t = text.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** O estado a deve substituir b? Vídeo novo ganha do antigo; no mesmo vídeo, o comando mais novo */
export function replaces(a: CinemaState, b: CinemaState): boolean {
  if (a.id !== b.id) return a.wall > b.wall || (a.wall === b.wall && a.id > b.id);
  return a.rev > b.rev || (a.rev === b.rev && a.by > b.by);
}

/** Onde o vídeo deveria estar agora */
export function expectedPos(s: LocalCinema, now = performance.now()): number {
  return Math.max(0, s.playing ? s.pos + (now - s.at) / 1000 : s.pos);
}

/** Sessão guardada nos atributos de quem conduz (para quem entra no meio) */
export function fromAttribute(raw: string | null, wallNow = Date.now()): CinemaState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as CinemaState;
    if (typeof s?.id !== "string" || typeof s.rev !== "number" || !s.source) return null;
    // A posição foi gravada em s.wall; tocando, já andou desde então
    const elapsed = s.playing ? Math.max(0, wallNow - s.wall) / 1000 : 0;
    return { ...s, pos: s.pos + elapsed };
  } catch {
    return null;
  }
}

/** Quem assume a sessão se quem conduzia saiu: sempre o mesmo para todos */
export const nextHost = (identities: string[]) => [...identities].sort()[0] ?? null;

// ---------- hook ----------

export function useCinema(voice: VoiceRoom) {
  const me = voice.participants.find((p) => p.isLocal)?.identity ?? null;
  const [session, setSession] = useState<LocalCinema | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // Vídeos encerrados: o atributo antigo de alguém não traz a sessão de volta
  const ended = useRef(new Set<string>());
  // O player na tela informa a posição real (sem player: a posição esperada)
  const playerTime = useRef<() => number | null>(() => null);
  // Arquivo que você abriu para esta sessão (cada um abre a própria cópia)
  const [file, setFileState] = useState<{ id: string; file: File; url: string } | null>(null);

  const adopt = useCallback((s: CinemaState) => {
    if (ended.current.has(s.id)) return;
    const cur = sessionRef.current;
    if (cur && !replaces(s, cur)) return;
    const next = { ...s, at: performance.now() };
    sessionRef.current = next;
    setSession(next);
  }, []);

  const send = useCallback((m: CinemaMessage) => voice.sendData(CINEMA_TOPIC, m), [voice.sendData]);

  const currentPos = () => {
    const s = sessionRef.current;
    if (!s) return 0;
    return playerTime.current() ?? expectedPos(s);
  };

  // Mensagens dos outros
  useEffect(
    () =>
      voice.onData((topic, data) => {
        if (topic !== CINEMA_TOPIC) return;
        const m = data as CinemaMessage;
        if (m.t === "state" && m.s) adopt(m.s);
        else if (m.t === "end") {
          ended.current.add(m.id);
          if (sessionRef.current?.id === m.id) {
            sessionRef.current = null;
            setSession(null);
          }
        } else if (m.t === "tick") {
          const cur = sessionRef.current;
          if (!cur || cur.id !== m.id || cur.rev !== m.rev) return;
          // Só re-renderiza se a referência mudou de verdade
          if (Math.abs(expectedPos(cur) - m.pos) < 0.4 && cur.playing === m.playing) return;
          const next = { ...cur, pos: m.pos, playing: m.playing, at: performance.now() };
          sessionRef.current = next;
          setSession(next);
        }
      }),
    [voice.onData, adopt],
  );

  // Entrou no meio: pega a sessão guardada nos atributos de quem conduz
  const attrs = voice.participants.map((p) => (p.isLocal ? "" : (p.cinema ?? ""))).join("\n");
  useEffect(() => {
    for (const p of voice.participants) {
      if (p.isLocal) continue;
      const s = fromAttribute(p.cinema);
      if (s) adopt(s);
    }
  }, [attrs]);

  // Quem conduzia saiu da chamada: outra pessoa assume (a mesma em todos os PCs)
  const ids = voice.participants.map((p) => p.identity).sort().join(",");
  useEffect(() => {
    const cur = sessionRef.current;
    if (!cur || !ids) return;
    const list = ids.split(",");
    if (list.includes(cur.host)) return;
    const host = nextHost(list);
    if (!host) return;
    const next = { ...cur, host };
    sessionRef.current = next;
    setSession(next);
  }, [ids, session?.host]);

  // Quem conduz: guarda a sessão nos atributos e manda a posição
  const isHost = !!session && !!me && session.host === me;
  useEffect(() => {
    if (!isHost || !session) return;
    const { at: _at, ...state } = session;
    voice.setCinemaAttr(JSON.stringify({ ...state, pos: currentPos(), wall: Date.now() }));
  }, [isHost, session?.id, session?.rev]);
  useEffect(() => {
    if (!isHost) return;
    const timer = setInterval(() => {
      const s = sessionRef.current;
      if (s) send({ t: "tick", id: s.id, rev: s.rev, pos: currentPos(), playing: s.playing });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [isHost, send]);
  // Deixou de conduzir (encerrou ou passou): tira dos atributos
  useEffect(() => {
    if (!isHost) voice.setCinemaAttr(null);
  }, [isHost]);

  // Saiu da chamada (ou trocou de sala): acaba a sessão aqui. Só quando a sala
  // muda de verdade: ao montar, não apaga a sessão que acabou de vir dos atributos
  const lastRoom = useRef(voice.room);
  useEffect(() => {
    if (lastRoom.current === voice.room) return;
    lastRoom.current = voice.room;
    sessionRef.current = null;
    setSession(null);
  }, [voice.room]);

  // Arquivo de outra sessão não serve mais
  useEffect(() => {
    if (file && file.id !== session?.id) {
      URL.revokeObjectURL(file.url);
      setFileState(null);
    }
  }, [session?.id]);

  /** Começa (ou troca) o vídeo da sala */
  const start = (source: CinemaSource, localFile?: File) => {
    if (!me) return;
    const s: CinemaState = { id: crypto.randomUUID(), host: me, source, playing: true, pos: 0, rev: 1, wall: Date.now(), by: me };
    if (localFile) setFileState({ id: s.id, file: localFile, url: URL.createObjectURL(localFile) });
    const next = { ...s, at: performance.now() };
    sessionRef.current = next;
    setSession(next);
    send({ t: "state", s });
  };

  /** Play, pausa ou pula, para todo mundo */
  const control = (patch: { playing?: boolean; pos?: number }) => {
    const cur = sessionRef.current;
    if (!cur || !me) return;
    const { at: _at, ...state } = cur;
    const s: CinemaState = {
      ...state,
      playing: patch.playing ?? cur.playing,
      pos: Math.max(0, patch.pos ?? currentPos()),
      rev: cur.rev + 1,
      wall: Date.now(),
      by: me,
    };
    const next = { ...s, at: performance.now() };
    sessionRef.current = next;
    setSession(next);
    send({ t: "state", s });
  };

  /** Encerra para todo mundo */
  const end = () => {
    const cur = sessionRef.current;
    if (!cur) return;
    ended.current.add(cur.id);
    voice.setCinemaAttr(null);
    send({ t: "end", id: cur.id });
    sessionRef.current = null;
    setSession(null);
  };

  /** Você abriu a sua cópia do arquivo da sessão */
  const openFile = (f: File) => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (file) URL.revokeObjectURL(file.url);
    setFileState({ id: cur.id, file: f, url: URL.createObjectURL(f) });
  };

  return {
    session,
    isHost,
    me,
    file: file && file.id === session?.id ? file : null,
    playerTime,
    start,
    control,
    end,
    openFile,
  };
}

export type Cinema = ReturnType<typeof useCinema>;
