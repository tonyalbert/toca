import { useState } from "react";
import { Check, CircleAlert, Copy, MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
  type RoomInfo,
} from "./api";
import type { Presence } from "./components/Avatar";
import { Button } from "./components/Button";
import { useConfirm } from "./components/ConfirmDialog";
import { EmptyState } from "./components/EmptyState";
import { Input } from "./components/Input";
import { Menu } from "./components/Menu";
import { PersonRow } from "./components/PersonRow";

type Tab = "all" | "incoming" | "outgoing";

const ago = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function since(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return ago.format(-Math.max(1, minutes), "minute");
  if (minutes < 60 * 24) return ago.format(-Math.round(minutes / 60), "hour");
  return ago.format(-Math.round(minutes / (60 * 24)), "day");
}

export function FriendsPage({
  myUsername,
  friends,
  incoming,
  outgoing,
  rooms,
  currentRoomId,
  onChanged,
  onJoinRoom,
}: {
  myUsername: string;
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  /** Suas salas: diz em qual sala cada amigo está agora */
  rooms: RoomInfo[];
  /** Sala em que você está (não mostra "Entrar" nela) */
  currentRoomId: string | null;
  /** Recarrega amigos e pedidos depois de uma ação */
  onChanged: () => Promise<void>;
  onJoinRoom: (room: RoomInfo) => void;
}) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(incoming.length > 0 ? "incoming" : "all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** Roda uma ação marcando o item como ocupado, e recarrega as listas */
  async function act(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
    await onChanged();
    setBusy(null);
  }

  // Onde cada amigo está: numa sala sua (em chamada), online ou offline
  const roomOf = (id: string) => rooms.find((r) => r.participants.some((p) => p.id === id));
  const presenceOf = (f: Friend): Presence => (roomOf(f.id) ? "call" : f.online ? "online" : "offline");
  const order: Record<Presence, number> = { call: 0, online: 1, offline: 2 };
  const sorted = [...friends].sort((a, b) => order[presenceOf(a)] - order[presenceOf(b)]);
  const onlineCount = friends.filter((f) => presenceOf(f) !== "offline").length;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: friends.length },
    { id: "incoming", label: "Recebidos", count: incoming.length },
    { id: "outgoing", label: "Enviados", count: outgoing.length },
  ];

  return (
    <>
      <div className="main-h">
        <div className="grow">
          <h1>Amigos</h1>
          <span className="sub">
            {friends.length === 0
              ? "Nenhum amigo ainda"
              : `${friends.length} ${friends.length === 1 ? "amigo" : "amigos"} · ${onlineCount} online`}
          </span>
        </div>
        <div className="tabs" role="tablist" aria-label="Filtrar amigos">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              <span className={`badge ${t.id === "incoming" && t.count > 0 ? "count" : ""}`} style={{ height: 18, padding: "0 6px" }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="main-b col" style={{ gap: 20 }}>
        <AddFriend onSent={onChanged} />

        {error && (
          <div className="notice error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {tab === "all" &&
          (friends.length === 0 ? (
            <EmptyState
              art="friends"
              title="Ninguém por aqui ainda"
              actions={<CopyHandle username={myUsername} />}
            >
              Mande seu @usuário para a turma ou procure o deles acima. Quando aceitarem, eles aparecem aqui.
            </EmptyState>
          ) : (
            <ul className="list">
              {sorted.map((f) => {
                const room = roomOf(f.id);
                const presence = presenceOf(f);
                return (
                  <PersonRow
                    key={f.id}
                    avatar={f.avatar}
                    name={f.displayName}
                    username={f.username}
                    presence={presence}
                    detail={room ? `Na ${room.name}` : f.online ? "Online" : "Offline"}
                  >
                    {room && room.id !== currentRoomId && (
                      <Button size="sm" onClick={() => onJoinRoom(room)}>
                        Entrar na {room.name}
                      </Button>
                    )}
                    <Menu
                      label={`Mais opções para ${f.displayName}`}
                      icon={<MoreHorizontal size={18} aria-hidden="true" />}
                      items={[
                        {
                          label: "Desfazer amizade",
                          icon: <UserMinus size={15} aria-hidden="true" />,
                          danger: true,
                          onSelect: async () => {
                            const ok = await confirm({
                              title: `Desfazer a amizade com ${f.displayName}?`,
                              message:
                                "Vocês saem da lista de amigos um do outro. Para voltar, alguém precisa mandar outro pedido.",
                              confirmLabel: "Desfazer amizade",
                              danger: true,
                            });
                            if (ok) void act(f.id, () => removeFriend(f.id));
                          },
                        },
                      ]}
                    />
                  </PersonRow>
                );
              })}
            </ul>
          ))}

        {tab === "incoming" &&
          (incoming.length === 0 ? (
            <p className="sm muted">Nenhum pedido recebido.</p>
          ) : (
            <ul className="list">
              {incoming.map((r) => (
                <PersonRow
                  key={r.id}
                  avatar={r.user.avatar}
                  name={r.user.displayName}
                  username={r.user.username}
                  detail={`quer ser seu amigo · ${since(r.createdAt)}`}
                >
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Check size={15} aria-hidden="true" />}
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, () => acceptFriendRequest(r.id))}
                  >
                    Aceitar
                  </Button>
                  <Button size="sm" disabled={busy === r.id} onClick={() => void act(r.id, () => declineFriendRequest(r.id))}>
                    Recusar
                  </Button>
                </PersonRow>
              ))}
            </ul>
          ))}

        {tab === "outgoing" &&
          (outgoing.length === 0 ? (
            <p className="sm muted">Nenhum pedido enviado.</p>
          ) : (
            <ul className="list">
              {outgoing.map((r) => (
                <PersonRow
                  key={r.id}
                  avatar={r.user.avatar}
                  name={r.user.displayName}
                  username={r.user.username}
                  detail={`enviado ${since(r.createdAt)}`}
                >
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void act(r.id, () => cancelFriendRequest(r.id))}>
                    Cancelar
                  </Button>
                </PersonRow>
              ))}
            </ul>
          ))}
      </div>
    </>
  );
}

function AddFriend({ onSent }: { onSent: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = username.trim().replace(/^@/, "");
    if (!value) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await sendFriendRequest(value);
      setResult(
        res.status === "accepted"
          ? { ok: true, text: `Vocês agora são amigos: ${res.friend.displayName} já tinha te adicionado.` }
          : { ok: true, text: `Pedido enviado para ${res.request.user.displayName}.` },
      );
      setUsername("");
      await onSent();
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <form className="panel add-friend" onSubmit={submit} noValidate>
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <div className="grow">
          <Input
            label="Adicionar por nome de usuário"
            prefix="@"
            spellCheck={false}
            autoComplete="off"
            maxLength={21}
            placeholder="usuario"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setResult(null);
            }}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          style={{ height: 44 }}
          icon={<UserPlus size={15} aria-hidden="true" />}
          disabled={busy || !username.trim()}
        >
          Enviar pedido
        </Button>
      </div>
      {result && (
        <div className={`notice ${result.ok ? "ok" : "error"}`} role={result.ok ? "status" : "alert"}>
          {result.ok ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
          {result.text}
        </div>
      )}
    </form>
  );
}

/** "Copiar meu @tony": manda o seu @ para a área de transferência */
function CopyHandle({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      icon={copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      onClick={() => {
        void navigator.clipboard.writeText(`@${username}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? "Copiado!" : `Copiar meu @${username}`}
    </Button>
  );
}
