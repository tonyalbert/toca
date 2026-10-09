import type { ReactNode } from "react";
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, ScreenShare, ScreenShareOff, Video, VideoOff } from "lucide-react";
import { useMicLevel } from "../useMicLevel";

/** Barra de controles da chamada (botões de 46 px; a dica vem do data-tip) */
export function CallControls({
  connected,
  muted,
  micTrack,
  deafened,
  cameraOn,
  screenSharing,
  onToggleMic,
  onToggleDeafen,
  onToggleCamera,
  onShareScreen,
  onLeave,
}: {
  connected: boolean;
  muted: boolean;
  micTrack: MediaStreamTrack | null;
  deafened: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  /** Abre o seletor (ou para, se já estiver compartilhando) */
  onShareScreen: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="ctrl-wrap">
      <div className="ctrl" role="toolbar" aria-label="Controles da chamada">
        <MicControl track={micTrack} muted={muted} disabled={!connected} onToggle={onToggleMic} />
        <ControlButton
          label={deafened ? "Voltar a ouvir a sala" : "Parar de ouvir a sala"}
          className={deafened ? "off" : ""}
          pressed={deafened}
          onClick={onToggleDeafen}
        >
          {deafened ? <HeadphoneOff aria-hidden="true" /> : <Headphones aria-hidden="true" />}
        </ControlButton>
        <ControlButton
          label={cameraOn ? "Desligar câmera" : "Ligar câmera"}
          className={cameraOn ? "on" : ""}
          pressed={cameraOn}
          disabled={!connected}
          onClick={onToggleCamera}
        >
          {cameraOn ? <Video aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
        </ControlButton>
        <ControlButton
          label={screenSharing ? "Parar de compartilhar" : "Compartilhar tela"}
          className={screenSharing ? "on" : ""}
          pressed={screenSharing}
          disabled={!connected}
          onClick={onShareScreen}
        >
          {screenSharing ? <ScreenShareOff aria-hidden="true" /> : <ScreenShare aria-hidden="true" />}
        </ControlButton>
        <span className="sep" aria-hidden="true" />
        <ControlButton label="Sair da sala" className="leave" onClick={onLeave}>
          <PhoneOff aria-hidden="true" />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  className,
  pressed,
  disabled,
  style,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  pressed?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`cb ${className ?? ""}`}
      aria-label={label}
      data-tip={label}
      aria-pressed={pressed}
      disabled={disabled}
      style={style}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// Separado: o nível do microfone atualiza ~20x por segundo e só ele re-renderiza
function MicControl({
  track,
  muted,
  disabled,
  onToggle,
}: {
  track: MediaStreamTrack | null;
  muted: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { level, speaking } = useMicLevel(track, muted);
  return (
    <ControlButton
      label={muted ? "Ligar microfone" : "Desligar microfone"}
      className={`mic ${muted ? "off" : ""} ${speaking ? "speaking" : ""}`}
      pressed={muted}
      disabled={disabled}
      style={{ "--level": level } as React.CSSProperties}
      onClick={onToggle}
    >
      {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
    </ControlButton>
  );
}
