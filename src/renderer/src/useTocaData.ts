import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFriendRequests,
  fetchFriends,
  fetchRooms,
  type Friend,
  type FriendRequest,
  type RoomInfo,
} from "./api";
import { connectRealtime, type RealtimeEvent } from "./realtime";

// Quem está em cada call não vem pelo WebSocket: a lista de salas é recarregada de tempos em tempos
const ROOMS_POLL_MS = 5000;

export interface TocaData {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  rooms: RoomInfo[];
  roomsLoaded: boolean;
  /** Tempo real conectado */
  online: boolean;
  reloadFriends: () => Promise<void>;
  reloadRooms: () => Promise<void>;
}

/** Amigos, pedidos e salas do usuário, atualizados pelos eventos do /ws */
export function useTocaData(onEvent: (event: RealtimeEvent) => void): TocaData {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [online, setOnline] = useState(false);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reloadFriends = useCallback(async () => {
    try {
      const [list, requests] = await Promise.all([fetchFriends(), fetchFriendRequests()]);
      setFriends(list);
      setIncoming(requests.incoming);
      setOutgoing(requests.outgoing);
    } catch {
      // sem rede: mantém o que já tinha; o próximo evento/reconexão recarrega
    }
  }, []);

  const reloadRooms = useCallback(async () => {
    try {
      setRooms(await fetchRooms());
      setRoomsLoaded(true);
    } catch {
      // idem
    }
  }, []);

  useEffect(() => {
    const stop = connectRealtime((event) => {
      switch (event.type) {
        case "connected":
          setOnline(true);
          void reloadFriends();
          void reloadRooms();
          break;
        case "disconnected":
          setOnline(false);
          break;
        case "friend_request_received":
        case "friend_request_accepted":
        case "friend_request_declined":
        case "friend_request_canceled":
        case "friend_removed":
          void reloadFriends();
          break;
        case "user_updated":
          void reloadFriends();
          void reloadRooms();
          break;
        case "room_renamed":
          setRooms((rs) => rs.map((r) => (r.id === event.roomId ? { ...r, name: event.name } : r)));
          break;
        case "room_removed":
        case "room_deleted":
          setRooms((rs) => rs.filter((r) => r.id !== event.roomId));
          void reloadRooms();
          break;
        case "room_added":
        case "room_members_changed":
          void reloadRooms();
          break;
      }
      onEventRef.current(event);
    });
    return stop;
  }, [reloadFriends, reloadRooms]);

  useEffect(() => {
    void reloadFriends();
    void reloadRooms();
    const id = setInterval(reloadRooms, ROOMS_POLL_MS);
    return () => clearInterval(id);
  }, [reloadFriends, reloadRooms]);

  return { friends, incoming, outgoing, rooms, roomsLoaded, online, reloadFriends, reloadRooms };
}
