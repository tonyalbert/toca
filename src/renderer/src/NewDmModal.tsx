import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "./components/Input";
import { Modal } from "./components/Modal";
import { PersonRow } from "./components/PersonRow";
import { usePeople, type Person } from "./people";

/**
 * Nova mensagem: escolhe com quem conversar. Dá para mandar mensagem para
 * amigos e para quem divide uma sala com você.
 */
export function NewDmModal({ onPick, onClose }: { onPick: (userId: string) => void; onClose: () => void }) {
  const { me, friends, rooms } = usePeople();
  const [query, setQuery] = useState("");

  // Amigos primeiro; depois quem está numa sala com você (sem repetir)
  const people = new Map<string, Person & { detail: string }>();
  for (const f of friends) people.set(f.id, { id: f.id, name: f.displayName, username: f.username, avatar: f.avatar, detail: "Amigo" });
  for (const r of rooms) {
    for (const m of r.members) {
      if (m.id === me.id || people.has(m.id)) continue;
      people.set(m.id, { id: m.id, name: m.displayName, username: m.username, avatar: m.avatar, detail: `Na ${r.name}` });
    }
  }
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const list = [...people.values()].filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.includes(q));

  return (
    <Modal title="Nova mensagem" description="Converse com um amigo ou com alguém das suas salas." onClose={onClose}>
      <Input
        label="Para"
        prefix={<Search size={15} aria-hidden="true" />}
        placeholder="Nome ou @usuário"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {people.size === 0 ? (
        <p className="sm muted">Adicione amigos ou entre numa sala para ter com quem conversar.</p>
      ) : list.length === 0 ? (
        <p className="sm muted">Ninguém com esse nome.</p>
      ) : (
        <ul className="list pick-list" style={{ maxHeight: 320 }}>
          {list.map((p) => (
            <PersonRow
              key={p.id}
              small
              avatar={p.avatar}
              name={p.name}
              username={p.username}
              detail={p.detail}
              onClick={() => onPick(p.id)}
            />
          ))}
        </ul>
      )}
    </Modal>
  );
}
