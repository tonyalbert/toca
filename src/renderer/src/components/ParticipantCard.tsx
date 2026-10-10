import type { VideoTrack } from "livekit-client";
import { HeadphoneOff, MicOff, MoreHorizontal, Volume1, VolumeX } from "lucide-react";
import type { Avatar as AvatarKind } from "../api";
import { Avatar } from "./Avatar";
import { VideoView } from "./VideoView";
import { IconButton } from "./Button";

/** grade: todos do mesmo tamanho · faixa: miniatura ao lado do destaque · destaque: grande */
export type TileVariant = "grid" | "strip" | "main";

export interface ParticipantCardProps {
  name: string;
  avatar: AvatarKind;
  isLocal: boolean;
  talking: boolean;
  muted: boolean;
  deafened: boolean;
  /** Câmera ligada: o vídeo ocupa o cartão */
  video?: VideoTrack | null;
  /** Volume com que você ouve a pessoa (1 = 100%); fora de 100% aparece no canto */
  volume?: number;
  /** Abre o cartão da pessoa (volume e amizade) perto do elemento */
  onPerson?: (anchor: Element) => void;
  variant?: TileVariant;
  /** Tamanho do bichinho (a grade calcula pelo tamanho do quadro) */
  avatarSize?: number;
  /** Clique no cartão (ex.: ampliar a câmera); o texto vai para leitores de tela */
  onActivate?: () => void;
  activateLabel?: string;
}

/**
 * Cartão de quem está na sala. Estados: normal, falando (anel âmbar,
 * equalizador e "Falando agora"), mutado e fone desligado (selo vermelho com
 * ícone). Nenhum estado depende só da cor.
 */
export function ParticipantCard({
  name,
  avatar,
  isLocal,
  talking,
  muted,
  deafened,
  video,
  volume = 1,
  onPerson,
  variant = "grid",
  avatarSize: avatarSizeProp,
  onActivate,
  activateLabel,
}: ParticipantCardProps) {
  const state = deafened ? "Fone desligado" : muted ? "Microfone desligado" : talking ? "Falando agora" : "";
  const percent = Math.round(volume * 100);
  const aria = [name, isLocal && "você", state.toLowerCase(), !isLocal && percent !== 100 && `volume ${percent}%`]
    .filter(Boolean)
    .join(", ");
  const avatarSize = avatarSizeProp ?? (variant === "strip" ? 44 : variant === "main" ? 128 : 104);

  return (
    <div
      className={["pc", variant, talking && "talk", video && "has-video", onActivate && "zoomable"].filter(Boolean).join(" ")}
      role="group"
      aria-label={aria}
      onContextMenu={
        onPerson
          ? (e) => {
              e.preventDefault();
              onPerson(e.currentTarget.querySelector(".pc-more") ?? e.currentTarget);
            }
          : undefined
      }
    >
      {/* Clique no quadro: amplia a câmera; sem câmera, abre o cartão da pessoa */}
      {(onActivate || onPerson) && (
        <button
          type="button"
          className="pc-hit"
          aria-label={onActivate ? (activateLabel ?? `Ampliar ${name}`) : `${name}: volume e amizade`}
          onClick={(e) => (onActivate ? onActivate() : onPerson?.(e.currentTarget.parentElement?.querySelector(".pc-more") ?? e.currentTarget))}
        />
      )}
      {isLocal && variant !== "strip" && <span className="you">você</span>}
      {video ? (
        // A própria câmera aparece espelhada, como num espelho (os outros te veem normal)
        <VideoView track={video} mirror={isLocal} className="pc-video" />
      ) : (
        <Avatar kind={avatar} size={avatarSize} mine={isLocal} talking={talking} />
      )}
      <span className="pc-text">
        <span className="name">
          {name}
          {talking && (
            <span className="eq" aria-hidden="true">
              <i />
              <i />
              <i />
              {variant !== "strip" && <i />}
            </span>
          )}
        </span>
        {variant !== "strip" && <span className="state">{state}</span>}
      </span>
      <span className="flags">
        {muted && !deafened && (
          <span className="flag">
            <MicOff aria-hidden="true" />
          </span>
        )}
        {deafened && (
          <span className="flag">
            <HeadphoneOff aria-hidden="true" />
          </span>
        )}
      </span>
      {onPerson && (
        <div className={`pc-vol ${!isLocal && percent !== 100 ? "is-set" : ""}`}>
          <IconButton
            size="sm"
            className="pc-more"
            label={isLocal ? "Seu perfil" : `${name}: volume e amizade`}
            onClick={(e) => onPerson(e.currentTarget)}
          >
            {!isLocal && percent !== 100 ? (
              <>
                {percent === 0 ? <VolumeX size={15} aria-hidden="true" /> : <Volume1 size={15} aria-hidden="true" />}
                <span className="vol-pct num">{percent}%</span>
              </>
            ) : (
              <MoreHorizontal size={16} aria-hidden="true" />
            )}
          </IconButton>
        </div>
      )}
    </div>
  );
}
