import { useState } from "react";
import { createPortal } from "react-dom";
import { Phone, PhoneCall, PhoneOff } from "lucide-react";
import type { Friend, RoomInfo, RoomRing } from "./api";
import type { Rings } from "./rings";
import { Avatar } from "./components/Avatar";
import { Button } from "./components/Button";
import { Modal } from "./components/Modal";
import { PersonRow } from "./components/PersonRow";
import { RoomIcon } from "./components/RoomIcon";
import { useToast } from "./components/Toasts";
import { presenceOf, presenceText } from "./status";

/** Alguém te chamando para a call: fica no alto da tela até atender, recusar ou acabar */
export function IncomingRings({ rings, onAccept }: { rings: Rings; onAccept: (ring: RoomRing) => void }) {
  if (rings.incoming.length === 0) return null;
  return createPortal(
    <div className="rings" aria-live="assertive">
      {rings.incoming.map((ring) => (
        <div key={ring.id} className="ring-card" role="alertdialog" aria-label={`${ring.from.displayName} está te chamando`}>
          <span className="ring-art">
            <Avatar kind={ring.from.avatar} photo={ring.from.photo} size={48} />
          </span>
          <div className="grow">
            <strong>{ring.from.displayName} está te chamando</strong>
            <span className="sub">
              <RoomIcon icon={ring.room.icon} size={13} /> {ring.joins ? `Te convidou para a ${ring.room.name}` : ring.room.name}
            </span>
          </div>
          <Button size="sm" variant="danger-soft" icon={<PhoneOff size={15} aria-hidden="true" />} onClick={() => void rings.decline(ring)}>
            Recusar
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Phone size={15} aria-hidden="true" />}
            autoFocus
            onClick={() => {
              void rings.accept(ring);
              onAccept(ring);
            }}
          >
            Entrar
          </Button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Escolher quem chamar para a call: gente da sala e (dono e adms) amigos de fora */
export function CallPeopleModal({
  room,
  meId,
  inCall,
  friends,
  canAddFriends,
  rings,
  onClose,
}: {
  room: RoomInfo;
  meId: string;
  /** ids de quem já está na call */
  inCall: Set<string>;
  friends: Friend[];
  /** Dono ou adm: pode chamar amigos de fora (entram na sala ao atender) */
  canAddFriends: boolean;
  rings: Rings;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const friendById = new Map(friends.map((f) => [f.id, f]));
  // Disponível primeiro; de quem não é amigo não dá para saber (o servidor confere)
  const rank = (id: string) => {
    const f = friendById.get(id);
    if (!f) return 1;
    return !f.online ? 3 : f.status === "dnd" ? 2 : 0;
  };
  const byRank = (a: { id: string }, b: { id: string }) => rank(a.id) - rank(b.id);
  const memberIds = new Set(room.members.map((m) => m.id));
  const members = room.members.filter((m) => m.id !== meId && !inCall.has(m.id)).sort(byRank);
  const outside = canAddFriends ? friends.filter((f) => !memberIds.has(f.id)).sort(byRank) : [];

  const call = async (userId: string) => {
    setBusy(userId);
    try {
      await rings.call(room.id, userId);
    } catch (err) {
      toast({ kind: "error", title: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const row = (p: { id: string; avatar: Friend["avatar"]; photo?: Friend["photo"]; nameStyle?: Friend["nameStyle"]; displayName: string; username: string }) => {
    const ringing = rings.callingTo(room.id, p.id);
    const f = friendById.get(p.id);
    const blocked = !!f && (!f.online || f.status === "dnd");
    return (
      <PersonRow
        key={p.id}
        small
        avatar={p.avatar}
        photo={p.photo}
        name={p.displayName}
        nameStyle={p.nameStyle}
        username={p.username}
        presence={f ? presenceOf(f) : undefined}
        detail={ringing ? "chamando…" : f ? presenceText(f) : undefined}
      >
        {ringing ? (
          <Button size="sm" variant="ghost" icon={<PhoneOff size={15} aria-hidden="true" />} onClick={() => void rings.cancel(ringing)}>
            Desistir
          </Button>
        ) : (
          <Button size="sm" icon={<PhoneCall size={15} aria-hidden="true" />} disabled={busy === p.id || blocked} onClick={() => void call(p.id)}>
            Chamar
          </Button>
        )}
      </PersonRow>
    );
  };

  return (
    <Modal title="Chamar para a call" description={`O PC da pessoa toca e ela entra na ${room.name} com um clique.`} onClose={onClose}>
      <div className="col" style={{ gap: 4 }}>
        <span className="eyebrow muted-eyebrow">Da sala</span>
        {members.length === 0 ? <p className="sm muted">Todo mundo da sala já está na call.</p> : <ul className="list">{members.map(row)}</ul>}
      </div>
      {outside.length > 0 && (
        <div className="col" style={{ gap: 4 }}>
          <span className="eyebrow muted-eyebrow">Amigos de fora da sala</span>
          <p className="xs muted">Se atenderem, entram na {room.name} como membros.</p>
          <ul className="list">{outside.map(row)}</ul>
        </div>
      )}
    </Modal>
  );
}
