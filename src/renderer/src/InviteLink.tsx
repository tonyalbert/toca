import { useEffect, useState } from "react";
import { Check, CircleAlert, Copy, Link2, Link2Off, RefreshCw } from "lucide-react";
import {
  createRoomInvite,
  deleteRoomInvite,
  fetchRoomInvite,
  inviteLink,
  type InviteExpiry,
  type RoomInfo,
  type RoomInvite,
} from "./api";
import { Button } from "./components/Button";
import { useConfirm } from "./components/ConfirmDialog";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const isExpired = (invite: RoomInvite) => !!invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now();

/**
 * Link de convite da sala (dono e adms): quem abre entra como membro, mesmo
 * sem ser amigo de ninguém. Vale 1 hora ou para sempre; gerar outro derruba o
 * anterior (para quando o link vazou).
 */
export function InviteLink({ room }: { room: RoomInfo }) {
  const confirm = useConfirm();
  const [invite, setInvite] = useState<RoomInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiry, setExpiry] = useState<InviteExpiry>("1h");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Atualiza a tela quando o link de 1 hora vence com a janela aberta
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchRoomInvite(room.id)
      .then((i) => alive && setInvite(i))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [room.id]);

  useEffect(() => {
    if (!invite?.expiresAt) return;
    const ms = new Date(invite.expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => setTick((t) => t + 1), ms + 500);
    return () => clearTimeout(id);
  }, [invite]);

  const active = invite && !isExpired(invite) ? invite : null;

  async function run(action: () => Promise<RoomInvite | null>) {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setInvite(await action());
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const generate = async () => {
    if (active) {
      const ok = await confirm({
        title: "Gerar um link novo?",
        message: "O link atual para de funcionar na hora. Quem já entrou na sala continua nela.",
        confirmLabel: "Gerar link novo",
      });
      if (!ok) return;
    }
    await run(() => createRoomInvite(room.id, expiry));
  };

  const disable = async () => {
    const ok = await confirm({
      title: "Desativar o link?",
      message: "Ninguém mais entra por ele. Você pode gerar outro quando quiser.",
      confirmLabel: "Desativar",
      danger: true,
    });
    if (ok) await run(async () => (await deleteRoomInvite(room.id), null));
  };

  const copy = () => {
    if (!active) return;
    window.toca
      .copyText(inviteLink(active.token))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("Não deu para copiar. Selecione o link e use Ctrl+C."));
  };

  return (
    <div className="col invite" style={{ gap: 8 }}>
      <span className="eyebrow muted-eyebrow">Link de convite</span>
      {error && (
        <div className="notice error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </div>
      )}
      {loading ? (
        <p className="sm muted">Carregando…</p>
      ) : active ? (
        <>
          <div className="invite-link">
            <Link2 size={16} aria-hidden="true" />
            <input readOnly value={inviteLink(active.token)} aria-label="Link de convite" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="primary" icon={copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} onClick={copy}>
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
          <p className="xs muted">
            {active.expiresAt ? `Vale até as ${timeFmt.format(new Date(active.expiresAt))}.` : "Não expira."} Quem abrir entra na sala
            como membro, mesmo sem ser seu amigo.
          </p>
        </>
      ) : (
        <p className="sm muted">
          {invite ? "O link expirou." : "Nenhum link ativo."} Gere um para chamar alguém que não está nos seus amigos.
        </p>
      )}

      {!loading && (
        <div className="row invite-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="tabs" role="radiogroup" aria-label="Validade do link">
            {(
              [
                ["1h", "1 hora"],
                ["never", "Permanente"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={expiry === value} onClick={() => setExpiry(value)}>
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" icon={<RefreshCw size={15} aria-hidden="true" />} disabled={busy} onClick={() => void generate()}>
            {active ? "Gerar novo link" : "Gerar link"}
          </Button>
          {active && (
            <Button size="sm" variant="ghost" icon={<Link2Off size={15} aria-hidden="true" />} disabled={busy} onClick={() => void disable()}>
              Desativar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
