import { useEffect, useState } from "react";
import {
  addRoomMember,
  createRoom,
  deleteRoom,
  removeRoomMember,
  renameRoom,
  type Friend,
  type RoomInfo,
  type User,
} from "./api";
import { PersonRow } from "./FriendsPage";
import { CrownIcon } from "./icons";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
        </header>
        {children}
      </div>
    </div>
  );
}

export function CreateRoomModal({
  onCreated,
  onClose,
}: {
  onCreated: (room: RoomInfo) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      onCreated(await createRoom(name.trim()));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Criar sala" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Nome da sala</span>
          <input autoFocus maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="muted-text">Você vai ser o dono e pode adicionar seus amigos depois.</div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            Criar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Dono: renomeia, adiciona amigos, remove membros e exclui. Membro: vê quem está e pode sair. */
export function RoomSettingsModal({
  room,
  me,
  friends,
  onChanged,
  onLeft,
  onClose,
}: {
  room: RoomInfo;
  me: User;
  friends: Friend[];
  onChanged: () => Promise<void>;
  /** Saiu da sala ou a excluiu */
  onLeft: () => void;
  onClose: () => void;
}) {
  const isOwner = room.role === "owner";
  const [name, setName] = useState(room.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const memberIds = new Set(room.members.map((m) => m.id));
  const candidates = friends.filter((f) => !memberIds.has(f.id));

  async function act(key: string, action: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    setError(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError((err as Error).message);
    }
    await onChanged();
    setBusy(null);
  }

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (value && value !== room.name) void act("rename", () => renameRoom(room.id, value));
  };

  return (
    <Modal title={isOwner ? "Configurações da sala" : room.name} onClose={onClose}>
      {isOwner && (
        <form className="field" onSubmit={rename}>
          <span className="field-label">Nome da sala</span>
          <div className="add-friend-row">
            <input maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
            <button
              type="submit"
              className="secondary"
              disabled={busy === "rename" || !name.trim() || name.trim() === room.name}
            >
              Salvar
            </button>
          </div>
        </form>
      )}

      <div className="field">
        <span className="field-label">Membros — {room.members.length}</span>
        <ul className="people compact">
          {room.members.map((m) => (
            <PersonRow
              key={m.id}
              name={m.displayName}
              username={m.username}
              note={m.role === "owner" ? "dono" : m.id === me.id ? "você" : undefined}
            >
              {m.role === "owner" && <CrownIcon className="owner-icon" />}
              {isOwner && m.role !== "owner" && (
                <button
                  className="secondary danger-text"
                  disabled={busy === m.id}
                  onClick={() => void act(m.id, () => removeRoomMember(room.id, m.id))}
                >
                  Remover
                </button>
              )}
            </PersonRow>
          ))}
        </ul>
      </div>

      {isOwner && (
        <div className="field">
          <span className="field-label">Adicionar amigos</span>
          {candidates.length === 0 ? (
            <div className="muted-text">
              {friends.length === 0 ? "Adicione amigos na tela de Amigos primeiro." : "Todos os seus amigos já estão aqui."}
            </div>
          ) : (
            <ul className="people compact">
              {candidates.map((f) => (
                <PersonRow key={f.id} name={f.displayName} username={f.username}>
                  <button
                    className="secondary"
                    disabled={busy === f.id}
                    onClick={() => void act(f.id, () => addRoomMember(room.id, f.id))}
                  >
                    Adicionar
                  </button>
                </PersonRow>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="modal-actions spread">
        {isOwner ? (
          <button
            className="secondary danger-text"
            disabled={busy === "delete"}
            onClick={() => {
              if (confirm(`Excluir a sala "${room.name}"? Quem estiver na call sai na hora.`)) {
                void act("delete", () => deleteRoom(room.id), onLeft);
              }
            }}
          >
            Excluir sala
          </button>
        ) : (
          <button
            className="secondary danger-text"
            disabled={busy === "leave"}
            onClick={() => {
              if (confirm(`Sair da sala "${room.name}"?`)) {
                void act("leave", () => removeRoomMember(room.id, me.id), onLeft);
              }
            }}
          >
            Sair da sala
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
