import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRoomSound, fetchRoomSounds, fetchSound, uploadRoomSound, type RoomSound } from "./api";
import type { RealtimeEvent } from "./realtime";
import type { VoiceRoom } from "./useVoiceRoom";
import { audioDuration, BUILTIN_SOUNDS, playBuffer, playBuiltin } from "./soundboard";

/**
 * Reações e soundboard da chamada. Os dois vão pelo canal de dados (LiveKit):
 * a reação sobe flutuando no cartão de quem mandou; o som toca no PC de cada
 * um (os prontos são sintetizados, os da sala vêm da API e ficam em cache).
 */

export const FUN_TOPIC = "toca.festa";
export const REACTIONS = ["😂", "🔥", "👏", "💀", "❤️", "😮", "🎉", "👍"];
/** Quanto tempo a reação fica subindo no cartão */
const FLOAT_MS = 2600;
/** Intervalo mínimo entre os seus sons (e o que aceita de cada pessoa) */
const SOUND_COOLDOWN_MS = 1200;
const REACT_COOLDOWN_MS = 250;
export const MAX_SOUND_SECONDS = 8;
export const MAX_SOUND_BYTES = 500 * 1024;

type FunMessage = { t: "react"; e: string } | { t: "sound"; s: string; label: string };

/** Algo subindo no cartão de alguém */
export interface Float {
  key: number;
  text: string;
  kind: "react" | "sound";
}

const UUID = /^[0-9a-f-]{36}$/i;

export function useFun(voice: VoiceRoom) {
  const me = voice.participants.find((p) => p.isLocal)?.identity ?? null;
  const [floats, setFloats] = useState<Record<string, Float[]>>({});
  const [sounds, setSounds] = useState<RoomSound[]>([]);
  const nextKey = useRef(1);
  const lastSent = useRef({ react: 0, sound: 0 });
  const lastFrom = useRef(new Map<string, number>());
  const roomRef = useRef(voice.room);
  roomRef.current = voice.room;

  const send = useCallback((m: FunMessage) => voice.sendData(FUN_TOPIC, m), [voice.sendData]);

  const float = useCallback((who: string, text: string, kind: Float["kind"]) => {
    const key = nextKey.current++;
    setFloats((all) => ({ ...all, [who]: [...(all[who] ?? []).slice(-5), { key, text, kind }] }));
    setTimeout(() => setFloats((all) => ({ ...all, [who]: (all[who] ?? []).filter((f) => f.key !== key) })), FLOAT_MS);
  }, []);

  /** Toca um som ("b:<id>" pronto, "r:<id>" da sala) aqui */
  const playHere = useCallback((ref: string) => {
    const [kind, id] = [ref.slice(0, 2), ref.slice(2)];
    if (kind === "b:") void playBuiltin(id);
    else if (kind === "r:" && UUID.test(id)) void playBuffer(id, () => fetchSound(id)).catch(() => {});
  }, []);

  // Sons da sala: carrega ao entrar e quando alguém sobe ou apaga um
  const reload = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return setSounds([]);
    try {
      const list = await fetchRoomSounds(room);
      if (roomRef.current === room) setSounds(list);
    } catch {
      // sem a lista, ficam só os prontos
    }
  }, []);
  useEffect(() => {
    setSounds([]);
    setFloats({});
    void reload();
  }, [voice.room, reload]);

  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === "room_sounds_changed" && event.roomId === roomRef.current) void reload();
    },
    [reload],
  );

  // Mensagens dos outros
  useEffect(
    () =>
      voice.onData((topic, data, from) => {
        if (topic !== FUN_TOPIC) return;
        const m = data as FunMessage;
        if (m.t === "react" && REACTIONS.includes(m.e)) {
          float(from, m.e, "react");
        } else if (m.t === "sound" && typeof m.s === "string") {
          const now = Date.now();
          if (now - (lastFrom.current.get(from) ?? 0) < SOUND_COOLDOWN_MS * 0.8) return;
          lastFrom.current.set(from, now);
          playHere(m.s);
          float(from, `🔊 ${String(m.label ?? "").slice(0, 28)}`, "sound");
        }
      }),
    [voice.onData, float, playHere],
  );

  /** Manda uma reação (sobe no seu cartão também) */
  const react = (emoji: string) => {
    const now = Date.now();
    if (!me || now - lastSent.current.react < REACT_COOLDOWN_MS) return;
    lastSent.current.react = now;
    send({ t: "react", e: emoji });
    float(me, emoji, "react");
  };

  /** Toca um som para a sala inteira; false se ainda está no intervalo */
  const play = (ref: string, label: string): boolean => {
    const now = Date.now();
    if (!me || now - lastSent.current.sound < SOUND_COOLDOWN_MS) return false;
    lastSent.current.sound = now;
    send({ t: "sound", s: ref, label });
    playHere(ref);
    float(me, `🔊 ${label}`, "sound");
    return true;
  };

  /** Sobe um som para a sala (confere o tamanho e a duração antes) */
  const upload = async (file: File, name: string, emoji: string) => {
    const room = roomRef.current;
    if (!room) throw new Error("Entre numa sala primeiro.");
    if (file.size > MAX_SOUND_BYTES) throw new Error("O som passa de 500 KB. Corte um pedaço menor.");
    let seconds: number;
    try {
      seconds = await audioDuration(file);
    } catch {
      throw new Error("Esse arquivo não abre como áudio. Use MP3, OGG, WAV ou M4A.");
    }
    if (seconds > MAX_SOUND_SECONDS + 0.3) throw new Error(`O som tem ${Math.round(seconds)} segundos. O máximo é ${MAX_SOUND_SECONDS}.`);
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("Não deu para ler o arquivo."));
      r.readAsDataURL(file);
    });
    await uploadRoomSound(room, { name: name.trim(), ...(emoji.trim() ? { emoji: emoji.trim() } : {}), data });
    await reload();
  };

  const remove = async (soundId: string) => {
    const room = roomRef.current;
    if (!room) return;
    await deleteRoomSound(room, soundId);
    await reload();
  };

  return { floats, sounds, builtins: BUILTIN_SOUNDS, react, play, upload, remove, onEvent, me };
}

export type Fun = ReturnType<typeof useFun>;
