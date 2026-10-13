import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { fetchInvite, joinInvite, parseInvite, type InvitePreview, type RoomInfo } from "./api";
import { Button } from "./components/Button";
import { Input } from "./components/Input";
import { Modal } from "./components/Modal";
import { RoomIcon } from "./components/RoomIcon";

/**
 * Entrar numa sala por link de convite. Vem com o código quando o link abriu
 * o app; sem código, pede para colar o link.
 */
export function JoinInviteModal({
  initialToken,
  onJoined,
  onClose,
}: {
  initialToken: string | null;
  /** Entrou (ou já era membro): abre a sala */
  onJoined: (room: RoomInfo | { id: string }) => void;
  onClose: () => void;
}) {
  const [token, setToken] = useState(initialToken);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setPreview(null);
    fetchInvite(token)
      .then((p) => alive && setPreview(p))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const submitLink = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInvite(text);
    if (!parsed) {
      setError("Isso não parece um link de convite do Toca.");
      return;
    }
    setToken(parsed);
  };

  const join = async () => {
    if (!token || !preview) return;
    if (preview.alreadyMember) {
      onJoined({ id: preview.room.id });
      return;
    }
    setJoining(true);
    setError(null);
    try {
      onJoined(await joinInvite(token));
    } catch (err) {
      setError((err as Error).message);
      setJoining(false);
    }
  };

  const errorBox = error && (
    <div className="notice error" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      {error}
    </div>
  );

  if (!token) {
    return (
      <Modal
        title="Entrar com link"
        description="Cole o link de convite que te mandaram."
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="invite-paste" disabled={!text.trim()}>
              Continuar
            </Button>
          </>
        }
      >
        <form id="invite-paste" className="col" style={{ gap: 12 }} onSubmit={submitLink}>
          <Input
            label="Link do convite"
            placeholder="https://toca.rabbitapps.com.br/convite/…"
            spellCheck={false}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          {errorBox}
        </form>
      </Modal>
    );
  }

  const room = preview?.room;
  return (
    <Modal
      title={preview?.alreadyMember ? "Você já está nessa sala" : "Convite para uma sala"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {preview ? "Agora não" : "Fechar"}
          </Button>
          {preview && (
            <Button variant="primary" disabled={joining} onClick={() => void join()}>
              {preview.alreadyMember ? "Abrir a sala" : joining ? "Entrando…" : "Entrar na sala"}
            </Button>
          )}
        </>
      }
    >
      {loading && <p className="sm muted">Abrindo o convite…</p>}
      {room && (
        <div className="row invite-room" style={{ gap: 14 }}>
          <span className="room-ico big" aria-hidden="true">
            <RoomIcon icon={room.icon} size={22} />
          </span>
          <div className="grow">
            <strong>{room.name}</strong>
            <p className="sm muted">
              {room.memberCount} {room.memberCount === 1 ? "membro" : "membros"}
              {!preview.alreadyMember && " · você entra como membro"}
            </p>
          </div>
        </div>
      )}
      {errorBox}
    </Modal>
  );
}
