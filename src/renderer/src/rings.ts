import { useCallback, useEffect, useRef, useState } from "react";
import { acceptRing, cancelRing, declineRing, ringRoomMember, type RingEndReason, type RoomRing } from "./api";
import type { RealtimeEvent } from "./realtime";
import { getNotifyPrefs } from "./notifyPrefs";
import { playCue } from "./sounds";

/** De quanto em quanto tempo o toque se repete */
const RING_EVERY_MS = 2200;

/** Uma chamada sua acabou: quem era e por quê */
export interface RingOutcome {
  roomId: string;
  userId: string;
  reason: RingEndReason;
}

/**
 * Chamar alguém da sala para a call. incoming: chamadas tocando aqui;
 * outgoing: quem você está chamando agora (por sala e pessoa).
 */
export function useRings(onOutcome: (o: RingOutcome) => void) {
  const [incoming, setIncoming] = useState<RoomRing[]>([]);
  const [outgoing, setOutgoing] = useState<RoomRing[]>([]);
  const outgoingRef = useRef(outgoing);
  outgoingRef.current = outgoing;
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const onEvent = useCallback((event: RealtimeEvent) => {
    if (event.type === "room_ring") {
      setIncoming((list) => [...list.filter((r) => r.id !== event.ring.id), event.ring]);
    } else if (event.type === "room_ring_ended") {
      setIncoming((list) => list.filter((r) => r.id !== event.ringId));
      const mine = outgoingRef.current.find((r) => r.id === event.ringId);
      if (mine) {
        setOutgoing((list) => list.filter((r) => r.id !== event.ringId));
        // Desistir foi você (ou chamou de novo): não precisa de aviso
        if (event.reason !== "canceled") onOutcomeRef.current({ roomId: event.roomId, userId: event.userId, reason: event.reason });
      }
    } else if (event.type === "connected") {
      // Ficou fora do ar: o fim das chamadas pode ter se perdido
      setIncoming([]);
      setOutgoing([]);
    }
  }, []);

  // Some sozinha no prazo, mesmo se o aviso do servidor não chegar
  useEffect(() => {
    const all = [...incoming, ...outgoing];
    if (all.length === 0) return;
    const next = Math.min(...all.map((r) => Date.parse(r.expiresAt)));
    const timer = setTimeout(
      () => {
        const now = Date.now() + 500;
        setIncoming((list) => list.filter((r) => Date.parse(r.expiresAt) > now));
        setOutgoing((list) => list.filter((r) => Date.parse(r.expiresAt) > now));
      },
      Math.max(0, next - Date.now()) + 1000,
    );
    return () => clearTimeout(timer);
  }, [incoming, outgoing]);

  // O toque, enquanto alguém estiver chamando
  const ringing = incoming.length > 0;
  useEffect(() => {
    if (!ringing || !getNotifyPrefs().ringSound) return;
    void playCue("ring");
    const timer = setInterval(() => void playCue("ring"), RING_EVERY_MS);
    return () => clearInterval(timer);
  }, [ringing]);

  /** Chama um membro da sala; o erro (offline, já na call) vem na promessa */
  const call = useCallback(async (roomId: string, userId: string) => {
    const ring = await ringRoomMember(roomId, userId);
    setOutgoing((list) => [...list.filter((r) => !(r.room.id === roomId && r.to === userId)), ring]);
  }, []);

  const cancel = useCallback(async (ring: RoomRing) => {
    setOutgoing((list) => list.filter((r) => r.id !== ring.id));
    await cancelRing(ring.id).catch(() => {});
  }, []);

  /**
   * Atende: o app entra na sala em seguida. Membro entra mesmo se a chamada já
   * tiver acabado; amigo de fora só entra se o servidor o colocou na sala.
   */
  const accept = useCallback(async (ring: RoomRing) => {
    setIncoming((list) => list.filter((r) => r.id !== ring.id));
    try {
      await acceptRing(ring.id);
    } catch (err) {
      if (!ring.joins) return;
      throw (err as Error).message.includes("acabou") ? new Error("Essa chamada já acabou. Peça para te chamarem de novo.") : err;
    }
  }, []);

  const decline = useCallback(async (ring: RoomRing) => {
    setIncoming((list) => list.filter((r) => r.id !== ring.id));
    await declineRing(ring.id).catch(() => {});
  }, []);

  /** Você está chamando esta pessoa nesta sala? */
  const callingTo = (roomId: string, userId: string) => outgoing.find((r) => r.room.id === roomId && r.to === userId) ?? null;

  return { incoming, outgoing, onEvent, call, cancel, accept, decline, callingTo };
}

export type Rings = ReturnType<typeof useRings>;
