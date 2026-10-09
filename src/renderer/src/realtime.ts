import { API_URL, getAccessToken, SessionExpiredError, type FriendRequest, type RoomRole, type User } from "./api";

/** Eventos que a API manda pelo /ws (veja API.md no toca-api) */
export type RealtimeEvent =
  | { type: "friend_request_received"; request: FriendRequest }
  | { type: "friend_request_accepted"; requestId: string; friend: User }
  | { type: "friend_request_declined"; requestId: string }
  | { type: "friend_request_canceled"; requestId: string }
  | { type: "friend_removed"; userId: string }
  /** Amigo, colega de sala ou você mesmo (em outro PC) trocou o nome */
  | { type: "user_updated"; user: User }
  | { type: "room_added"; room: { id: string; name: string; ownerId: string; role: RoomRole } }
  | { type: "room_removed"; roomId: string }
  | { type: "room_renamed"; roomId: string; name: string }
  | { type: "room_deleted"; roomId: string }
  | { type: "room_members_changed"; roomId: string }
  /** Gerado aqui: (re)conectou. Eventos perdidos enquanto estava fora: recarregue as listas. */
  | { type: "connected" }
  /** Gerado aqui: a conexão caiu (vai reconectar sozinha) */
  | { type: "disconnected" };

const WS_URL = `${API_URL.replace(/^http/, "ws")}/ws`;
const MAX_BACKOFF_MS = 30_000;

/** Conexão em tempo real com reconexão automática */
export function connectRealtime(onEvent: (event: RealtimeEvent) => void): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let waiting = false; // esperando para reconectar

  const scheduleReconnect = () => {
    if (stopped) return;
    const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
    attempt++;
    waiting = true;
    retryTimer = setTimeout(open, delay);
  };

  async function open() {
    waiting = false;
    if (stopped) return;
    let token: string;
    try {
      token = await getAccessToken();
    } catch (err) {
      if (err instanceof SessionExpiredError) return; // o app volta para o login
      return scheduleReconnect();
    }
    if (stopped) return;

    const ws = new WebSocket(WS_URL);
    socket = ws;
    let ready = false;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
    ws.onmessage = (msg) => {
      let data: { type?: string };
      try {
        data = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      if (data.type === "ready") {
        ready = true;
        attempt = 0;
        onEvent({ type: "connected" });
      } else if (data.type) {
        onEvent(data as RealtimeEvent);
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (ready && !stopped) onEvent({ type: "disconnected" });
      scheduleReconnect();
    };
  }

  // Voltou a internet: tenta já, sem esperar o tempo de espera
  const online = () => {
    if (!waiting || stopped) return;
    clearTimeout(retryTimer);
    attempt = 0;
    void open();
  };
  window.addEventListener("online", online);

  void open();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    window.removeEventListener("online", online);
    socket?.close();
  };
}
