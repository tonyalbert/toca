import { createContext, useContext, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import {
  acceptFriendRequest,
  sendFriendRequest,
  type Avatar as AvatarKind,
  type Friend,
  type FriendRequest,
  type Profile,
  type RoomInfo,
} from "./api";
import { Button } from "./components/Button";
import type { ChatTarget } from "./useChat";

/** Alguém que aparece no app (amigo, membro de sala, você) */
export interface Person {
  id: string;
  name: string;
  username: string;
  avatar: AvatarKind;
}

export type Relation =
  | { kind: "self" }
  | { kind: "friend" }
  | { kind: "outgoing" }
  | { kind: "incoming"; requestId: string }
  | { kind: "none" };

export interface People {
  me: Profile;
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  rooms: RoomInfo[];
  reloadFriends: () => Promise<void>;
  /** Abre uma conversa (chat da sala ou conversa direta) */
  openChat: (target: ChatTarget) => void;
  /** Abre o cartão da pessoa perto do elemento clicado */
  openPerson: (userId: string, anchor: Element) => void;
}

const PeopleContext = createContext<People | null>(null);
export const PeopleProvider = PeopleContext.Provider;

export function usePeople(): People {
  const people = useContext(PeopleContext);
  if (!people) throw new Error("usePeople precisa do PeopleProvider");
  return people;
}

/** Nome, @ e bichinho de alguém pelo id (você, amigos, pedidos e membros das salas) */
export function findPerson(people: People, id: string): Person | null {
  const { me, friends, incoming, outgoing, rooms } = people;
  if (id === me.id) return { id, name: me.displayName, username: me.username, avatar: me.avatar };
  const user =
    friends.find((f) => f.id === id) ??
    rooms.flatMap((r) => r.members).find((m) => m.id === id) ??
    [...incoming, ...outgoing].map((r) => r.user).find((u) => u.id === id);
  return user ? { id, name: user.displayName, username: user.username, avatar: user.avatar } : null;
}

export function relationOf(people: People, id: string): Relation {
  if (id === people.me.id) return { kind: "self" };
  if (people.friends.some((f) => f.id === id)) return { kind: "friend" };
  const incoming = people.incoming.find((r) => r.user.id === id);
  if (incoming) return { kind: "incoming", requestId: incoming.id };
  if (people.outgoing.some((r) => r.user.id === id)) return { kind: "outgoing" };
  return { kind: "none" };
}

/** Botão de amizade conforme a relação: adicionar, pedido enviado, aceitar ou "amigos" */
export function FriendAction({
  person,
  size = "sm",
  hideFriend,
}: {
  person: Person;
  size?: "sm" | "md";
  /** Em listas: quem já é amigo não ganha selo */
  hideFriend?: boolean;
}) {
  const people = usePeople();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relation = relationOf(people, person.id);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await people.reloadFriends();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  if (relation.kind === "self") return null;
  if (relation.kind === "friend") {
    if (hideFriend) return null;
    return (
      <span className="badge ok">
        <Check size={13} aria-hidden="true" />
        Amigos
      </span>
    );
  }
  if (relation.kind === "outgoing") return <span className="badge">Pedido enviado</span>;
  return (
    <span className="col" style={{ gap: 4, alignItems: "flex-end" }}>
      {relation.kind === "incoming" ? (
        <Button
          size={size}
          variant="primary"
          icon={<Check size={15} aria-hidden="true" />}
          disabled={busy}
          onClick={() => void run(() => acceptFriendRequest(relation.requestId))}
        >
          Aceitar pedido
        </Button>
      ) : (
        <Button
          size={size}
          icon={<UserPlus size={15} aria-hidden="true" />}
          disabled={busy}
          onClick={() => void run(() => sendFriendRequest(person.username))}
        >
          Adicionar amigo
        </Button>
      )}
      {error && <span className="err">{error}</span>}
    </span>
  );
}
