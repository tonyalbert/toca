import { useState } from "react";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
} from "./api";
import { Avatar } from "./Avatar";
import { CheckIcon, CloseIcon, UsersIcon } from "./icons";

type Tab = "all" | "pending" | "add";

export function FriendsPage({
  friends,
  incoming,
  outgoing,
  onChanged,
}: {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  /** Recarrega amigos e pedidos depois de uma ação */
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>(incoming.length > 0 ? "pending" : friends.length === 0 ? "add" : "all");
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

  const pendingCount = incoming.length + outgoing.length;

  return (
    <>
      <header className="stage-header">
        <UsersIcon />
        <span>Amigos</span>
        <div className="header-tabs">
          <button className={`header-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
            Todos
          </button>
          <button className={`header-tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
            Pendentes
            {incoming.length > 0 && <span className="badge">{incoming.length}</span>}
          </button>
          <button className={`header-tab add ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
            Adicionar amigo
          </button>
        </div>
      </header>

      <div className="page">
        {error && <div className="form-error">{error}</div>}

        {tab === "all" && (
          <>
            <div className="section-title">Amigos — {friends.length}</div>
            {friends.length === 0 && <div className="muted-text">Você ainda não adicionou ninguém.</div>}
            <ul className="people">
              {friends.map((f) => (
                <PersonRow key={f.id} name={f.displayName} username={f.username}>
                  <button
                    className="secondary danger-text"
                    disabled={busy === f.id}
                    onClick={() => {
                      if (confirm(`Desfazer a amizade com ${f.displayName}?`)) void act(f.id, () => removeFriend(f.id));
                    }}
                  >
                    Desfazer amizade
                  </button>
                </PersonRow>
              ))}
            </ul>
          </>
        )}

        {tab === "pending" && (
          <>
            {pendingCount === 0 && <div className="muted-text">Nenhum pedido pendente.</div>}
            {incoming.length > 0 && <div className="section-title">Recebidos — {incoming.length}</div>}
            <ul className="people">
              {incoming.map((r) => (
                <PersonRow key={r.id} name={r.user.displayName} username={r.user.username} note="quer ser seu amigo">
                  <button
                    className="round-button ok"
                    title="Aceitar"
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, () => acceptFriendRequest(r.id))}
                  >
                    <CheckIcon />
                  </button>
                  <button
                    className="round-button no"
                    title="Recusar"
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, () => declineFriendRequest(r.id))}
                  >
                    <CloseIcon />
                  </button>
                </PersonRow>
              ))}
            </ul>
            {outgoing.length > 0 && <div className="section-title">Enviados — {outgoing.length}</div>}
            <ul className="people">
              {outgoing.map((r) => (
                <PersonRow key={r.id} name={r.user.displayName} username={r.user.username} note="pedido enviado">
                  <button
                    className="round-button no"
                    title="Cancelar pedido"
                    disabled={busy === r.id}
                    onClick={() => void act(r.id, () => cancelFriendRequest(r.id))}
                  >
                    <CloseIcon />
                  </button>
                </PersonRow>
              ))}
            </ul>
          </>
        )}

        {tab === "add" && <AddFriend onSent={onChanged} />}
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
    const value = username.trim();
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
    <form className="add-friend" onSubmit={submit}>
      <div className="section-title">Adicionar amigo</div>
      <div className="muted-text">Digite o nome de usuário da pessoa (não o nome de exibição).</div>
      <div className="add-friend-row">
        <input
          autoFocus
          spellCheck={false}
          maxLength={20}
          placeholder="nome de usuário"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setResult(null);
          }}
        />
        <button type="submit" className="primary" disabled={busy || !username.trim()}>
          Enviar pedido
        </button>
      </div>
      {result && <div className={result.ok ? "form-success" : "form-error"}>{result.text}</div>}
    </form>
  );
}

export function PersonRow({
  name,
  username,
  note,
  children,
}: {
  name: string;
  username: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="person">
      <Avatar name={name} size={32} />
      <div className="person-info">
        <div className="person-name">{name}</div>
        <div className="muted-text">
          @{username}
          {note && ` · ${note}`}
        </div>
      </div>
      <div className="person-actions">{children}</div>
    </li>
  );
}
