export const API_URL = (import.meta.env.VITE_API_URL ?? "https://api-toca.rabbitapps.com.br").replace(/\/$/, "");

/** Espécie legada ou receita versionada de avatar personalizado. */
import type { Avatar } from "./avatar";
export type { Avatar } from "./avatar";

export const ROOM_ICONS = ["sofa", "game", "film", "music", "book", "moon"] as const;
export type RoomIcon = (typeof ROOM_ICONS)[number];

/** Outra pessoa (amigo, membro de sala): sempre com @ e nome */
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: Avatar;
}

/** A própria conta: o @ e o nome ficam vazios entre o cadastro e a escolha */
export interface Account {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatar: Avatar;
}

/** Conta com @ e nome já escolhidos */
export type Profile = Account & { username: string; displayName: string };

export const isProfileComplete = (a: Account): a is Profile => !!a.username && !!a.displayName;

export interface Friend extends User {
  /** Está com o app aberto agora */
  online: boolean;
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
  icon: RoomIcon;
  ownerId: string;
  role: RoomRole;
  members: RoomMember[];
  participants: RoomParticipant[];
  /** Mensagens não lidas no chat da sala */
  unread: number;
}

export interface TokenResponse {
  token: string;
  url: string;
  identity: string;
  room: string;
}

interface Session {
  user: Account;
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

async function startSession(session: Session): Promise<Account> {
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
export async function restoreSession(): Promise<Account | null> {
  refreshToken = await window.toca.loadSession();
  if (!refreshToken) return null;
  try {
    await refresh();
  } catch (err) {
    if (err instanceof SessionExpiredError) return null;
    throw err;
  }
  return (await authed<{ user: Account }>("/me")).user;
}

/** login = e-mail ou @ */
export async function login(loginName: string, password: string): Promise<Account> {
  return startSession(await call<Session>("/auth/login", json("POST", { login: loginName, password })));
}

/** Cadastro só com e-mail e senha; depois o app pede o @ e o nome (updateProfile) */
export async function register(email: string, password: string): Promise<Account> {
  return startSession(await call<Session>("/auth/register", json("POST", { email, password })));
}

/** Escolhe o @ (uma vez só); troca o nome de exibição e o bichinho quando quiser */
export const updateProfile = async (changes: { username?: string; displayName?: string; avatar?: Avatar }) =>
  (await authed<{ user: Account }>("/me", json("PATCH", changes))).user;

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

export const createRoom = async (name: string, icon?: RoomIcon) =>
  (await authed<{ room: RoomInfo }>("/rooms", json("POST", { name, icon }))).room;

/** Renomeia e/ou troca o ícone (só o dono) */
export const updateRoom = (id: string, changes: { name?: string; icon?: RoomIcon }) =>
  authed(`/rooms/${id}`, json("PATCH", changes));

export const renameRoom = (id: string, name: string) => updateRoom(id, { name });

export const deleteRoom = (id: string) => authed<void>(`/rooms/${id}`, { method: "DELETE" });

export const addRoomMember = (id: string, userId: string) =>
  authed(`/rooms/${id}/members`, json("POST", { userId }));

/** O dono remove alguém; com o próprio id, sai da sala */
export const removeRoomMember = (id: string, userId: string) =>
  authed<void>(`/rooms/${id}/members/${userId}`, { method: "DELETE" });

export const fetchRoomToken = (id: string) => authed<TokenResponse>(`/rooms/${id}/token`, { method: "POST" });

// ---------- chat ----------

/** Onde a mensagem está: chat de uma sala ou conversa direta entre duas pessoas */
export type Conversation = { kind: "room"; roomId: string } | { kind: "dm"; userIds: [string, string] };

export interface ChatMessage {
  id: string;
  conversation: Conversation;
  author: User;
  body: string;
  createdAt: string;
}

export interface MessagePage {
  /** Da mais antiga para a mais nova */
  messages: ChatMessage[];
  /** Ainda há mensagens mais antigas */
  hasMore: boolean;
}

/** Uma conversa direta na lista: a outra pessoa, a última mensagem e as não lidas */
export interface DmSummary {
  user: User;
  lastMessage: ChatMessage;
  unread: number;
}

export const MAX_MESSAGE = 2000;

const pageQuery = (before?: string) => (before ? `?before=${before}` : "");

export const fetchRoomMessages = (roomId: string, before?: string) =>
  authed<MessagePage>(`/rooms/${roomId}/messages${pageQuery(before)}`);

export const sendRoomMessage = async (roomId: string, body: string) =>
  (await authed<{ message: ChatMessage }>(`/rooms/${roomId}/messages`, json("POST", { body }))).message;

export const markRoomRead = (roomId: string) => authed<void>(`/rooms/${roomId}/read`, { method: "POST" });

export const fetchDms = async () => (await authed<{ conversations: DmSummary[] }>("/dms")).conversations;

export const fetchDmMessages = (userId: string, before?: string) =>
  authed<MessagePage>(`/dms/${userId}/messages${pageQuery(before)}`);

export const sendDm = async (userId: string, body: string) =>
  (await authed<{ message: ChatMessage }>(`/dms/${userId}/messages`, json("POST", { body }))).message;

export const markDmRead = (userId: string) => authed<void>(`/dms/${userId}/read`, { method: "POST" });

export const deleteMessage = (id: string) => authed<void>(`/messages/${id}`, { method: "DELETE" });
