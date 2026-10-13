import { useState } from "react";
import { CircleAlert, Crown, LogOut, MoreHorizontal, Search, ShieldCheck, ShieldOff, Trash2, UserMinus, UserPlus } from "lucide-react";
import {
  addRoomMember,
  canManageRoom,
  createRoom,
  deleteRoom,
  removeRoomMember,
  setRoomMemberRole,
  transferRoom,
  updateRoom,
  type Friend,
  type RoomRole,
  type RoomIcon as RoomIconKind,
  type RoomInfo,
  type User,
} from "./api";
import { Button, IconButton } from "./components/Button";
import { Checkbox } from "./components/Checkbox";
import { useConfirm } from "./components/ConfirmDialog";
import { Input } from "./components/Input";
import { Menu, type MenuItem } from "./components/Menu";
import { Modal } from "./components/Modal";
import { PersonRow } from "./components/PersonRow";
import { RoomIconPicker } from "./components/RoomIconPicker";
import { FriendAction } from "./people";
import { InviteLink } from "./InviteLink";

/** Nova sala: nome, ícone e os amigos que já entram nela */
export function CreateRoomModal({
  friends,
  onCreated,
  onClose,
}: {
  friends: Friend[];
  onCreated: (room: RoomInfo) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<RoomIconKind>("sofa");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setInvited((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(name.trim(), icon);
      // A sala já existe: se algum convite falhar, ela aparece mesmo assim
      const failed: string[] = [];
      for (const id of invited) {
        await addRoomMember(room.id, id).catch(() => failed.push(friends.find((f) => f.id === id)?.displayName ?? "?"));
      }
      if (failed.length > 0) setError(`Sala criada, mas não deu para chamar: ${failed.join(", ")}`);
      onCreated(room);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nova sala"
      description="Um cantinho fixo para a turma se encontrar."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {busy ? "Criando…" : "Criar sala"}
          </Button>
        </>
      }
    >
      <form className="col" style={{ gap: 16 }} onSubmit={submit}>
        <Input
          label="Nome da sala"
          maxLength={50}
          placeholder="Ex.: Sofá, Jogatina, Estudos"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <RoomIconPicker value={icon} onChange={setIcon} />
      </form>

      <div className="field">
        <span className="label">
          Chamar amigos{" "}
          <span className="muted" style={{ fontWeight: 500 }}>
            · {invited.size} {invited.size === 1 ? "selecionado" : "selecionados"}
          </span>
        </span>
        {friends.length === 0 ? (
          <p className="sm muted">Você ainda não tem amigos para chamar. Dá para adicionar depois, pelos membros da sala.</p>
        ) : (
          <ul className="list pick-list">
            {friends.map((f) => (
              <PersonRow
                key={f.id}
                small
                avatar={f.avatar} photo={f.photo}
                name={f.displayName}
                username={f.username}
                onClick={() => toggle(f.id)}
                lead={<Checkbox checked={invited.has(f.id)} onChange={() => toggle(f.id)} label={`Chamar ${f.displayName}`} />}
              />
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="notice error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </div>
      )}
    </Modal>
  );
}

export type RoomModalTab = "members" | "room";

/**
 * Janela da sala. Membros: quem pode entrar (o dono adiciona amigos e remove
 * gente). Sala: nome e ícone (dono) e excluir/sair.
 */
export function RoomModal({
  room,
  me,
  friends,
  initialTab,
  onChanged,
  onLeft,
  onClose,
}: {
  room: RoomInfo;
  me: User;
  friends: Friend[];
  initialTab: RoomModalTab;
  onChanged: () => Promise<void>;
  /** Saiu da sala ou a excluiu */
  onLeft: () => void;
  onClose: () => void;
}) {
  const role = room.role;
  const owner = room.members.find((m) => m.role === "owner");
  const [tab, setTab] = useState<RoomModalTab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Modal
      title={room.name}
      description={
        role === "owner"
          ? "Você é o dono: cuida dos membros, do link de convite e do nome e ícone da sala."
          : role === "admin"
            ? "Você é adm: cuida dos membros, do link de convite e do nome e ícone da sala."
            : `Quem cuida desta sala: ${owner?.displayName ?? "o dono"} (dono) e os adms.`
      }
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Pronto
        </Button>
      }
    >
      <div className="tabs" role="tablist" aria-label="Seções da sala" style={{ alignSelf: "flex-start" }}>
        <button role="tab" aria-selected={tab === "members"} onClick={() => setTab("members")}>
          Membros
          <span className="badge" style={{ height: 18, padding: "0 6px" }}>
            {room.members.length}
          </span>
        </button>
        <button role="tab" aria-selected={tab === "room"} onClick={() => setTab("room")}>
          Sala
        </button>
      </div>

      {error && (
        <div className="notice error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      {tab === "members" ? (
        <MembersTab room={room} me={me} friends={friends} role={role} busy={busy} act={act} />
      ) : (
        <RoomTab room={room} me={me} role={role} busy={busy} act={act} onLeft={onLeft} />
      )}
    </Modal>
  );
}

type Act = (key: string, action: () => Promise<unknown>, after?: () => void) => Promise<void>;

function MembersTab({
  room,
  me,
  friends,
  role,
  busy,
  act,
}: {
  room: RoomInfo;
  me: User;
  friends: Friend[];
  role: RoomRole;
  busy: string | null;
  act: Act;
}) {
  const confirm = useConfirm();
  const isOwner = role === "owner";
  const [query, setQuery] = useState("");
  // Remoção pede confirmação na própria linha
  const [confirming, setConfirming] = useState<string | null>(null);

  const memberIds = new Set(room.members.map((m) => m.id));
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const outside = friends
    .filter((f) => !memberIds.has(f.id))
    .filter((f) => !q || f.displayName.toLowerCase().includes(q) || f.username.includes(q));

  // O dono remove qualquer um; o adm, só membros comuns
  const canRemove = (m: RoomInfo["members"][number]) =>
    m.id !== me.id && (isOwner ? m.role !== "owner" : role === "admin" && m.role === "member");

  const roleItems = (m: RoomInfo["members"][number]): MenuItem[] => {
    if (m.id === me.id) return [];
    const items: MenuItem[] = [];
    if (m.role === "member" && canManageRoom(role)) {
      items.push({
        label: "Tornar adm",
        icon: <ShieldCheck size={15} aria-hidden="true" />,
        onSelect: () => void act(m.id, () => setRoomMemberRole(room.id, m.id, "admin")),
      });
    }
    if (m.role === "admin" && isOwner) {
      items.push({
        label: "Tirar de adm",
        icon: <ShieldOff size={15} aria-hidden="true" />,
        onSelect: () => void act(m.id, () => setRoomMemberRole(room.id, m.id, "member")),
      });
    }
    if (isOwner) {
      items.push({
        label: "Passar a sala",
        icon: <Crown size={15} aria-hidden="true" />,
        onSelect: async () => {
          const ok = await confirm({
            title: `Passar a sala para ${m.displayName}?`,
            message: `A sala passa a ser de ${m.displayName}. Você continua como adm, mas só ${m.displayName} vai poder excluir a sala ou passá-la adiante.`,
            confirmLabel: "Passar a sala",
          });
          if (ok) void act(m.id, () => transferRoom(room.id, m.id));
        },
      });
    }
    return items;
  };

  return (
    <>
      {canManageRoom(role) && (
        <>
          <InviteLink room={room} />
          <Input
            label="Adicionar amigo"
            prefix={<Search size={15} aria-hidden="true" />}
            placeholder="Nome ou @usuário"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="col" style={{ gap: 4 }}>
            <span className="eyebrow muted-eyebrow">Amigos fora da sala</span>
            {outside.length === 0 ? (
              <p className="sm muted">
                {friends.length === 0
                  ? "Adicione amigos na tela de Amigos primeiro."
                  : q
                    ? "Nenhum amigo com esse nome fora da sala."
                    : "Todos os seus amigos já estão aqui."}
              </p>
            ) : (
              <ul className="list">
                {outside.map((f) => (
                  <PersonRow key={f.id} small avatar={f.avatar} photo={f.photo} name={f.displayName} username={f.username}>
                    <Button
                      size="sm"
                      icon={<UserPlus size={15} aria-hidden="true" />}
                      disabled={busy === f.id}
                      onClick={() => void act(f.id, () => addRoomMember(room.id, f.id))}
                    >
                      Adicionar
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="col" style={{ gap: 4 }}>
        <span className="eyebrow muted-eyebrow">Na sala · {room.members.length}</span>
        <ul className="list">
          {room.members.map((m) => (
            <PersonRow
              key={m.id}
              small
              avatar={m.avatar} photo={m.photo}
              name={m.displayName}
              username={m.username}
              detail={m.id === me.id ? "você" : undefined}
            >
              {m.id !== me.id && (
                <FriendAction hideFriend person={{ id: m.id, name: m.displayName, username: m.username, avatar: m.avatar }} />
              )}
              {m.role === "owner" && <span className="badge accent">Dono</span>}
              {m.role === "admin" && <span className="badge">Adm</span>}
              {canRemove(m) && confirming === m.id && (
                <>
                  <span className="xs muted">Remover {m.displayName}?</span>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    disabled={busy === m.id}
                    onClick={() => void act(m.id, () => removeRoomMember(room.id, m.id), () => setConfirming(null))}
                  >
                    Remover
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Não
                  </Button>
                </>
              )}
              {canRemove(m) && confirming !== m.id && (
                <IconButton size="sm" label={`Remover ${m.displayName} da sala`} onClick={() => setConfirming(m.id)}>
                  <UserMinus size={16} aria-hidden="true" />
                </IconButton>
              )}
              {confirming !== m.id && roleItems(m).length > 0 && (
                <Menu label={`Mais opções para ${m.displayName}`} icon={<MoreHorizontal size={16} aria-hidden="true" />} items={roleItems(m)} />
              )}
            </PersonRow>
          ))}
        </ul>
      </div>
    </>
  );
}

function RoomTab({
  room,
  me,
  role,
  busy,
  act,
  onLeft,
}: {
  room: RoomInfo;
  me: User;
  role: RoomRole;
  busy: string | null;
  act: Act;
  onLeft: () => void;
}) {
  const confirm = useConfirm();
  const isOwner = role === "owner";
  const [name, setName] = useState(room.name);
  const [icon, setIcon] = useState<RoomIconKind>(room.icon);
  const changed = (name.trim() && name.trim() !== room.name) || icon !== room.icon;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed) return;
    void act("save", () =>
      updateRoom(room.id, { ...(name.trim() !== room.name ? { name: name.trim() } : {}), ...(icon !== room.icon ? { icon } : {}) }),
    );
  };

  return (
    <>
      {canManageRoom(role) && (
        <form className="col" style={{ gap: 16 }} onSubmit={save}>
          <Input label="Nome da sala" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
          <RoomIconPicker value={icon} onChange={setIcon} />
          <Button type="submit" style={{ alignSelf: "flex-start" }} disabled={!changed || busy === "save"}>
            {busy === "save" ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      )}

      <div className="panel danger-zone">
        {isOwner ? (
          <div className="row" style={{ gap: 16 }}>
            <div className="grow">
              <strong className="sm">Excluir a sala</strong>
              <p className="xs muted">
                Some para todos os membros e quem estiver nela sai na hora. Para sair sem excluir, passe a sala para alguém
                em Membros.
              </p>
            </div>
            <Button
              variant="danger-soft"
              size="sm"
              icon={<Trash2 size={15} aria-hidden="true" />}
              disabled={busy === "delete"}
              onClick={async () => {
                const ok = await confirm({
                  title: `Excluir a sala ${room.name}?`,
                  message: "A sala some para todos os membros e quem estiver nela sai na hora. Não dá para desfazer.",
                  confirmLabel: "Excluir sala",
                  danger: true,
                });
                if (ok) void act("delete", () => deleteRoom(room.id), onLeft);
              }}
            >
              Excluir sala
            </Button>
          </div>
        ) : (
          <>
            {role === "admin" && (
              <div className="row" style={{ gap: 16 }}>
                <div className="grow">
                  <strong className="sm">Deixar de ser adm</strong>
                  <p className="xs muted">Você continua na sala, como membro comum.</p>
                </div>
                <Button
                  size="sm"
                  icon={<ShieldOff size={15} aria-hidden="true" />}
                  disabled={busy === "unadmin"}
                  onClick={() => void act("unadmin", () => setRoomMemberRole(room.id, me.id, "member"))}
                >
                  Deixar de ser adm
                </Button>
              </div>
            )}
            <div className="row" style={{ gap: 16 }}>
              <div className="grow">
                <strong className="sm">Sair da sala</strong>
                <p className="xs muted">Ela some da sua lista. Para voltar, o dono ou um adm precisa te adicionar de novo.</p>
              </div>
              <Button
                variant="danger-soft"
                size="sm"
                icon={<LogOut size={15} aria-hidden="true" />}
                disabled={busy === "leave"}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Sair da sala ${room.name}?`,
                    message: "Ela some da sua lista. Para voltar, o dono ou um adm precisa te adicionar de novo.",
                    confirmLabel: "Sair da sala",
                    danger: true,
                  });
                  if (ok) void act("leave", () => removeRoomMember(room.id, me.id), onLeft);
                }}
              >
                Sair da sala
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
