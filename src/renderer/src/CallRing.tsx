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
              <RoomIcon icon={ring.room.icon} size={13} /> {ring.room.name}
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

/** Escolher quem da sala chamar para a call */
export function CallPeopleModal({
  room,
  meId,
  inCall,
  friends,
  rings,
  onClose,
}: {
  room: RoomInfo;
  meId: string;
  /** ids de quem já está na call */
  inCall: Set<string>;
  friends: Friend[];
  rings: Rings;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const online = new Map(friends.map((f) => [f.id, f.online]));
  // Online primeiro; de quem não é amigo não dá para saber (o servidor confere)
  const rank = (id: string) => (online.get(id) === true ? 0 : online.get(id) === false ? 2 : 1);
  const people = room.members.filter((m) => m.id !== meId && !inCall.has(m.id)).sort((a, b) => rank(a.id) - rank(b.id));

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

  return (
    <Modal title="Chamar para a call" description={`O PC da pessoa toca e ela entra na ${room.name} com um clique.`} onClose={onClose}>
      {people.length === 0 ? (
        <p className="sm muted">Todo mundo da sala já está na call.</p>
      ) : (
        <ul className="list">
          {people.map((m) => {
            const ringing = rings.callingTo(room.id, m.id);
            const isOffline = online.get(m.id) === false;
            return (
              <PersonRow
                key={m.id}
                small
                avatar={m.avatar}
                photo={m.photo}
                name={m.displayName}
                username={m.username}
                presence={online.has(m.id) ? (isOffline ? "offline" : "online") : undefined}
                detail={ringing ? "chamando…" : isOffline ? "offline" : undefined}
              >
                {ringing ? (
                  <Button size="sm" variant="ghost" icon={<PhoneOff size={15} aria-hidden="true" />} onClick={() => void rings.cancel(ringing)}>
                    Desistir
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    icon={<PhoneCall size={15} aria-hidden="true" />}
                    disabled={busy === m.id || isOffline}
                    onClick={() => void call(m.id)}
                  >
                    Chamar
                  </Button>
                )}
              </PersonRow>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
