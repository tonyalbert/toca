import { useCallback, useMemo, useRef, useState } from "react";
import {
  fetchDms,
  markDmRead,
  markRoomRead,
  type ChatMessage,
  type Conversation,
  type DmSummary,
  type RoomInfo,
} from "./api";
import type { RealtimeEvent } from "./realtime";

/** Conversa aberta no app: o chat de uma sala ou a conversa direta com alguém */
export type ChatTarget = { kind: "room"; roomId: string } | { kind: "dm"; userId: string };

export const targetKey = (t: ChatTarget) => (t.kind === "room" ? `room:${t.roomId}` : `dm:${t.userId}`);

/** De que conversa é isto, do ponto de vista de quem está usando o app */
export function conversationTarget(c: Conversation, meId: string): ChatTarget {
  if (c.kind === "room") return { kind: "room", roomId: c.roomId };
  return { kind: "dm", userId: c.userIds.find((id) => id !== meId) ?? c.userIds[0] };
}

export type ChatEvent =
  | { type: "created"; key: string; message: ChatMessage }
  | { type: "deleted"; key: string; messageId: string };

/** A conversa está na tela agora (aberta, com a janela em foco)? */
const onScreen = (open: string | null, key: string) => open === key && document.hasFocus() && !document.hidden;

/**
 * Estado do chat: conversas diretas, mensagens não lidas e os eventos em tempo
 * real (repassados para a conversa aberta, que cuida da própria lista).
 */
export function useChat(meId: string) {
  const [dms, setDms] = useState<DmSummary[]>([]);
  // Não lidas das salas: o servidor manda na lista de salas (recarregada a cada
  // poucos segundos); aqui ficam só as que chegaram depois do último carregamento
  const [roomExtra, setRoomExtra] = useState<Map<string, number>>(new Map());
  const [roomRead, setRoomRead] = useState<Set<string>>(new Set());
  const openKey = useRef<string | null>(null);
  const [open, setOpenState] = useState<string | null>(null);
  const listeners = useRef(new Set<(e: ChatEvent) => void>());

  const reloadDms = useCallback(async () => {
    try {
      setDms(await fetchDms());
    } catch {
      // sem rede: fica o que já tinha
    }
  }, []);

  /** A lista de salas foi recarregada: o servidor já conta tudo */
  const roomsReloaded = useCallback(() => {
    setRoomExtra(new Map());
    setRoomRead(new Set());
  }, []);

  /** Quem está aberto agora (a conversa chama isto ao aparecer e ao sumir) */
  const setOpen = useCallback((key: string | null) => {
    openKey.current = key;
    setOpenState(key);
  }, []);

  const markRead = useCallback((target: ChatTarget) => {
    if (target.kind === "room") {
      setRoomRead((s) => new Set(s).add(target.roomId));
      setRoomExtra((m) => {
        const next = new Map(m);
        next.delete(target.roomId);
        return next;
      });
      void markRoomRead(target.roomId).catch(() => {});
    } else {
      setDms((list) => list.map((d) => (d.user.id === target.userId ? { ...d, unread: 0 } : d)));
      void markDmRead(target.userId).catch(() => {});
    }
  }, []);

  /** Repassa os eventos de chat do /ws; devolve se a mensagem nova está na tela */
  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === "connected") {
        void reloadDms();
        return;
      }
      if (event.type === "message_created") {
        const { message } = event;
        const target = conversationTarget(message.conversation, meId);
        const key = targetKey(target);
        const mine = message.author.id === meId;
        const counts = !mine && !onScreen(openKey.current, key);
        if (target.kind === "room") {
          if (counts) {
            setRoomRead((s) => {
              const next = new Set(s);
              next.delete(target.roomId);
              return next;
            });
            setRoomExtra((m) => new Map(m).set(target.roomId, (m.get(target.roomId) ?? 0) + 1));
          }
        } else {
          setDms((list) => {
            const current = list.find((d) => d.user.id === target.userId);
            if (!current) {
              // Conversa nova: busca a lista (traz quem é a pessoa)
              void reloadDms();
              return list;
            }
            const updated = { ...current, lastMessage: message, unread: current.unread + (counts ? 1 : 0) };
            return [updated, ...list.filter((d) => d !== current)];
          });
        }
        listeners.current.forEach((l) => l({ type: "created", key, message }));
        return;
      }
      if (event.type === "message_deleted") {
        const key = targetKey(conversationTarget(event.conversation, meId));
        listeners.current.forEach((l) => l({ type: "deleted", key, messageId: event.messageId }));
        // A última mensagem de uma conversa direta pode ter sumido
        if (event.conversation.kind === "dm") void reloadDms();
        return;
      }
      if (event.type === "chat_read") {
        const target = conversationTarget(event.conversation, meId);
        if (target.kind === "room") setRoomRead((s) => new Set(s).add(target.roomId));
        else setDms((list) => list.map((d) => (d.user.id === target.userId ? { ...d, unread: 0 } : d)));
      }
    },
    [meId, reloadDms],
  );

  const subscribe = useCallback((listener: (e: ChatEvent) => void) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

  const roomUnread = useCallback(
    (room: RoomInfo) => {
      if (open === `room:${room.id}` || roomRead.has(room.id)) return roomExtra.get(room.id) ?? 0;
      return room.unread + (roomExtra.get(room.id) ?? 0);
    },
    [open, roomRead, roomExtra],
  );

  /** A mensagem nova vai aparecer na tela agora? (aí não precisa avisar) */
  const isShown = useCallback(
    (message: ChatMessage) => onScreen(openKey.current, targetKey(conversationTarget(message.conversation, meId))),
    [meId],
  );

  const dmUnreadTotal = useMemo(() => dms.reduce((n, d) => n + d.unread, 0), [dms]);

  return { dms, reloadDms, roomsReloaded, open, setOpen, markRead, onEvent, subscribe, roomUnread, dmUnreadTotal, isShown };
}

export type Chat = ReturnType<typeof useChat>;
