import { useState } from "react";
import type { VideoTrack } from "livekit-client";
import { HeadphoneOff, MicOff } from "lucide-react";
import type { Avatar as AvatarKind } from "../api";
import { Avatar } from "./Avatar";
import { VideoView } from "./VideoView";
import { VolumeControl } from "./VolumeControl";

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
  /** Volume com que você ouve a pessoa (1 = 100%) */
  volume?: number;
  maxVolume?: number;
  /** Só para os outros: muda o volume (o seu próprio cartão não tem) */
  onVolume?: (volume: number) => void;
  variant?: TileVariant;
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
  maxVolume = 2,
  onVolume,
  variant = "grid",
  onActivate,
  activateLabel,
}: ParticipantCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const state = deafened ? "Fone desligado" : muted ? "Microfone desligado" : talking ? "Falando agora" : "";
  const aria = [name, isLocal && "você", state.toLowerCase(), onVolume && volume !== 1 && `volume ${Math.round(volume * 100)}%`]
    .filter(Boolean)
    .join(", ");
  const avatarSize = variant === "strip" ? 44 : variant === "main" ? 128 : 104;

  return (
    <div
      className={["pc", variant, talking && "talk", video && "has-video", onActivate && "zoomable"].filter(Boolean).join(" ")}
      role="group"
      aria-label={aria}
      onContextMenu={
        onVolume
          ? (e) => {
              e.preventDefault();
              setMenuOpen(true);
            }
          : undefined
      }
    >
      {onActivate && (
        <button type="button" className="pc-hit" aria-label={activateLabel ?? `Ampliar ${name}`} onClick={onActivate} />
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
      {onVolume && (
        <VolumeControl
          className="pc-vol"
          name={name}
          volume={volume}
          max={maxVolume}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onChange={onVolume}
        />
      )}
    </div>
  );
}
