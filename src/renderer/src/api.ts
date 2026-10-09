export const API_URL = (import.meta.env.VITE_API_URL ?? "https://api-toca.rabbitapps.com.br").replace(/\/$/, "");

export interface User {
  id: string;
  username: string;
  displayName: string;
}

export interface Friend extends User {
  since: string;
}

export interface FriendRequest {
  id: string;
  /** A outra pessoa (quem enviou, nos recebidos; quem recebeu, nos enviados) */
  user: User;
  createdAt: string;
}

export type RoomRole = "owner" | "member";

export interface RoomMember extends User {
  role: RoomRole;
}

export interface RoomParticipant {
  /** id do usuário (identity no LiveKit) */
  id: string;
  name: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  ownerId: string;
  role: RoomRole;
  members: RoomMember[];
  participants: RoomParticipant[];
}

export interface TokenResponse {
  token: string;
  url: string;
  identity: string;
  room: string;
}

interface Session {
  user: User;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A sessão acabou (refresh recusado): o app volta para a tela de login */
export class SessionExpiredError extends Error {
  constructor() {
    super("Sua sessão expirou. Entre de novo.");
  }
}

// ---------- Sessão ----------

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshToken: string | null = null;
let refreshing: Promise<void> | null = null;
let sessionLost: (() => void) | null = null;

/** Chamado quando a sessão cai (ex.: refresh token revogado em outro lugar) */
export function onSessionLost(callback: () => void): void {
  sessionLost = callback;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError("Sem conexão com o servidor", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? body.message ?? `Erro ${res.status}`, res.status);
  return body as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function startSession(session: Session): Promise<User> {
  accessToken = session.accessToken;
  // Renova um minuto antes de expirar
  accessExpiresAt = Date.now() + (session.accessTokenExpiresIn - 60) * 1000;
  refreshToken = session.refreshToken;
  await window.toca.saveSession(refreshToken);
  return session.user;
}

async function clearSession(): Promise<void> {
  accessToken = null;
  accessExpiresAt = 0;
  refreshToken = null;
  await window.toca.saveSession(null);
}

/**
 * Troca o refresh token por um par novo. Uma renovação por vez: a API derruba
 * a sessão se o mesmo refresh token for usado duas vezes.
 */
function refresh(): Promise<void> {
  refreshing ??= (async () => {
    const token = refreshToken;
    if (!token) throw new SessionExpiredError();
    try {
      await startSession(await call<Session>("/auth/refresh", json("POST", { refreshToken: token })));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearSession();
        sessionLost?.();
        throw new SessionExpiredError();
      }
      throw err; // sem rede etc.: a sessão continua salva
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Access token válido (renova se estiver para expirar) */
export async function getAccessToken(): Promise<string> {
  if (!accessToken || Date.now() >= accessExpiresAt) await refresh();
  return accessToken!;
}

/** Requisição autenticada; se o token for recusado, renova e tenta mais uma vez */
async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = async () =>
    call<T>(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${await getAccessToken()}` } });
  try {
    return await send();
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) throw err;
    accessExpiresAt = 0;
    return send();
  }
}

// ---------- Contas ----------

/** Retoma a sessão salva. null = precisa entrar. Lança ApiError se estiver sem rede. */
export async function restoreSession(): Promise<User | null> {
  refreshToken = await window.toca.loadSession();
  if (!refreshToken) return null;
  try {
    await refresh();
  } catch (err) {
    if (err instanceof SessionExpiredError) return null;
    throw err;
  }
  return (await authed<{ user: User }>("/me")).user;
}

export async function login(username: string, password: string): Promise<User> {
  return startSession(await call<Session>("/auth/login", json("POST", { username, password })));
}

export async function register(input: {
  username: string;
  displayName: string;
  password: string;
  inviteCode: string;
}): Promise<User> {
  return startSession(await call<Session>("/auth/register", json("POST", input)));
}

export async function logout(): Promise<void> {
  const token = refreshToken;
  await clearSession();
  if (token) await call("/auth/logout", json("POST", { refreshToken: token })).catch(() => {});
}

// ---------- Amigos ----------

export type Relation = "self" | "friend" | "outgoing" | "incoming" | "none";

export const findUser = (username: string) =>
  authed<{ user: User; relation: Relation }>(`/users/${encodeURIComponent(username)}`);

export const fetchFriends = async () => (await authed<{ friends: Friend[] }>("/friends")).friends;

export const fetchFriendRequests = () =>
  authed<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>("/friends/requests");

export const sendFriendRequest = (username: string) =>
  authed<{ status: "sent"; request: FriendRequest } | { status: "accepted"; friend: User }>(
    "/friends/requests",
    json("POST", { username }),
  );

export const acceptFriendRequest = (id: string) =>
  authed<{ friend: User }>(`/friends/requests/${id}/accept`, { method: "POST" });

export const declineFriendRequest = (id: string) =>
  authed<void>(`/friends/requests/${id}/decline`, { method: "POST" });

export const cancelFriendRequest = (id: string) => authed<void>(`/friends/requests/${id}`, { method: "DELETE" });

export const removeFriend = (userId: string) => authed<void>(`/friends/${userId}`, { method: "DELETE" });

// ---------- Salas ----------

export const fetchRooms = async () => (await authed<{ rooms: RoomInfo[] }>("/rooms")).rooms;

export const createRoom = async (name: string) =>
  (await authed<{ room: RoomInfo }>("/rooms", json("POST", { name }))).room;

export const renameRoom = (id: string, name: string) => authed(`/rooms/${id}`, json("PATCH", { name }));

export const deleteRoom = (id: string) => authed<void>(`/rooms/${id}`, { method: "DELETE" });

export const addRoomMember = (id: string, userId: string) =>
  authed(`/rooms/${id}/members`, json("POST", { userId }));

/** O dono remove alguém; com o próprio id, sai da sala */
export const removeRoomMember = (id: string, userId: string) =>
  authed<void>(`/rooms/${id}/members/${userId}`, { method: "DELETE" });

export const fetchRoomToken = (id: string) => authed<TokenResponse>(`/rooms/${id}/token`, { method: "POST" });
