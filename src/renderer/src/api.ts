const API_URL = (import.meta.env.VITE_API_URL ?? "https://api-toca.rabbitapps.com.br").replace(/\/$/, "");

export interface RoomParticipant {
  identity: string;
  name: string;
}

export interface RoomInfo {
  slug: string;
  name: string;
  participants: RoomParticipant[];
}

export interface TokenResponse {
  token: string;
  url: string;
  identity: string;
  room: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? body.message ?? `Erro ${res.status}`);
  }
  return body as T;
}

export async function fetchRooms(): Promise<RoomInfo[]> {
  const { rooms } = await request<{ rooms: RoomInfo[] }>("/rooms");
  return rooms;
}

export function fetchToken(name: string, room: string): Promise<TokenResponse> {
  return request<TokenResponse>("/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, room }),
  });
}
