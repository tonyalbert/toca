import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Pencil, Volume1, Volume2, VolumeX } from "lucide-react";
import { FriendAction, type Person } from "../people";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Slider } from "./Slider";

const WIDTH = 300;
const GAP = 8;

/**
 * Cartão de uma pessoa: quem é, o volume com que você a ouve (se ela está na
 * chamada com você) e a amizade (adicionar, aceitar, pedido enviado).
 */
export function PersonPopover({
  person,
  anchor,
  isMe,
  volume,
  maxVolume = 2,
  onVolume,
  screenVolume,
  onScreenVolume,
  onEditProfile,
  onMessage,
  onClose,
}: {
  person: Person;
  anchor: Element;
  isMe: boolean;
  /** Só quando a pessoa está na chamada com você */
  volume?: number;
  maxVolume?: number;
  onVolume?: (volume: number) => void;
  /** Só quando ela compartilha a tela com o som do PC */
  screenVolume?: number;
  onScreenVolume?: (volume: number) => void;
  onEditProfile: () => void;
  /** Abre a conversa direta com a pessoa */
  onMessage: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Ao lado do que foi clicado; se não couber, do outro lado / mais acima
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const h = el.offsetHeight;
    let left = a.right + GAP;
    if (left + WIDTH > window.innerWidth - 8) left = Math.max(8, a.left - WIDTH - GAP);
    let top = a.top;
    if (top + h > window.innerHeight - 8) top = Math.max(44, window.innerHeight - h - 8);
    setPos({ left, top });
  }, [anchor, volume !== undefined, screenVolume !== undefined]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  const percent = Math.round((volume ?? 1) * 100);
  const Icon = percent === 0 ? VolumeX : percent < 100 ? Volume1 : Volume2;

  return createPortal(
    <div
      ref={ref}
      className="person-pop"
      role="dialog"
      aria-label={person.name}
      style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
    >
      <div className="row" style={{ gap: 12 }}>
        <Avatar kind={person.avatar} photo={person.photo} size={52} mine={isMe} />
        <div className="grow">
          <strong className="person-pop-name">{person.name}</strong>
          <span className="xs muted">@{person.username}</span>
        </div>
      </div>

      {isMe ? (
        <Button size="sm" icon={<Pencil size={14} aria-hidden="true" />} onClick={onEditProfile}>
          Editar perfil
        </Button>
      ) : (
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" icon={<MessageSquare size={14} aria-hidden="true" />} onClick={onMessage}>
            Mensagem
          </Button>
          <FriendAction person={person} />
        </div>
      )}

      {!isMe && onVolume && (
        <div className="person-pop-vol">
          <Slider
            label="Volume para você"
            value={percent}
            min={0}
            max={maxVolume * 100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => onVolume(v / 100)}
            hint="Só você ouve assim. Fica guardado para as próximas chamadas."
          />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Button
              size="sm"
              variant="ghost"
              icon={<Icon size={15} aria-hidden="true" />}
              onClick={() => onVolume(percent === 0 ? 1 : 0)}
            >
              {percent === 0 ? "Voltar a ouvir" : "Silenciar para mim"}
            </Button>
            <button type="button" className="link" disabled={percent === 100} onClick={() => onVolume(1)}>
              Voltar a 100%
            </button>
          </div>
        </div>
      )}

      {!isMe && onScreenVolume && (
        <div className="person-pop-vol">
          <Slider
            label="Som da tela compartilhada"
            value={Math.round((screenVolume ?? 1) * 100)}
            min={0}
            max={maxVolume * 100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => onScreenVolume(v / 100)}
            hint="O som do vídeo ou do jogo que vem junto com a tela."
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
