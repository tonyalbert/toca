import { ConnectionState } from "livekit-client";
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Plus,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { Avatar as AvatarKind, Friend, Profile, RoomInfo } from "./api";
import type { UpdateState } from "../../shared/update";
import type { VoiceRoom } from "./useVoiceRoom";
import { useMicLevel } from "./useMicLevel";
import { Avatar, avatarMap } from "./components/Avatar";
import { Button, IconButton } from "./components/Button";
import { RoomIcon } from "./components/RoomIcon";

/** Alguém numa sala, como aparece na lista lateral */
interface RoomPerson {
  id: string;
  name: string;
  avatar: AvatarKind;
  talking: boolean;
  muted: boolean;
  deafened: boolean;
  sharing: boolean;
}

export function Sidebar({
  me,
  rooms,
  friends,
  incomingCount,
  online,
  voice,
  version,
  update,
  view,
  onOpenRoom,
  onRoomSettings,
  onCreateRoom,
  onFriends,
  onSettings,
  onProfile,
}: {
  me: Profile;
  rooms: RoomInfo[];
  friends: Friend[];
  incomingCount: number;
  /** Tempo real conectado */
  online: boolean;
  voice: VoiceRoom;
  version: string | null;
  update: UpdateState;
  view: "friends" | "voice";
  onOpenRoom: (room: RoomInfo) => void;
  onRoomSettings: (roomId: string) => void;
  onCreateRoom: () => void;
  onFriends: () => void;
  onSettings: () => void;
  onProfile: () => void;
}) {
  const connected = voice.connection === ConnectionState.Connected;
  const callRoom = rooms.find((r) => r.id === voice.room);

  const avatars = avatarMap(me, friends, rooms);

  const peopleIn = (room: RoomInfo): RoomPerson[] => {
    // Na sala em que estamos, o LiveKit diz na hora quem fala, quem está mutado etc.
    if (room.id === voice.room && connected) {
      return voice.participants.map((p) => ({
        id: p.identity,
        name: p.name,
        avatar: avatars.get(p.identity) ?? "rabbit",
        talking: p.isSpeaking,
        muted: p.isMuted,
        deafened: p.isLocal ? voice.deafened : p.isDeafened,
        sharing: !!p.screenTrack,
      }));
    }
    // Nas outras, só quem está lá (você pode aparecer se estiver em outro PC)
    return room.participants
      .filter((p) => p.id !== me.id || room.id !== voice.room)
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: avatars.get(p.id) ?? "rabbit",
        talking: false,
        muted: false,
        deafened: false,
        sharing: false,
      }));
  };

  const versionNote = !online
    ? "Reconectando…"
    : update.status === "downloaded"
      ? `v${update.version} pronta`
      : update.status === "downloading"
        ? `Baixando ${update.percent}%`
        : "";

  return (
    <aside className="side" aria-label="Suas tocas">
      <div className="side-h">
        <h2>Suas tocas</h2>
        <IconButton label="Criar sala" size="sm" solid onClick={onCreateRoom}>
          <Plus size={15} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="side-scroll">
        {rooms.length === 0 && (
          <div className="panel side-empty">
            <strong className="sm">Nenhuma toca ainda</strong>
            <p className="xs muted">Crie uma sala e chame a turma, ou peça para um amigo te adicionar.</p>
            <Button size="sm" icon={<Plus size={15} aria-hidden="true" />} onClick={onCreateRoom}>
              Criar sala
            </Button>
          </div>
        )}

        {rooms.map((room) => {
          const people = peopleIn(room);
          const isOn = room.id === voice.room;
          return (
            <div key={room.id} className={`room ${isOn ? "is-on" : ""}`}>
              <button
                className="room-main"
                onClick={() => onOpenRoom(room)}
                aria-current={isOn && view === "voice" ? "page" : undefined}
                data-tip={isOn ? "Ver a sala" : `Entrar em ${room.name}`}
              >
                <span className="room-h">
                  <span className="room-ico">
                    <RoomIcon icon={room.icon} />
                  </span>
                  <span className="room-name">{room.name}</span>
                  {people.length > 0 && (
                    <span className="count" aria-label={`${people.length} na sala`}>
                      {people.length}
                    </span>
                  )}
                </span>
                {people.length > 0 ? (
                  <span className="room-ppl">
                    {people.map((p) => (
                      <span key={p.id} className={`rp ${p.talking ? "talk" : ""}`}>
                        <Avatar kind={p.avatar} size={20} talking={p.talking} mine={p.id === me.id} />
                        <span className="rp-name">{p.name}</span>
                        <span className="flags">
                          {p.talking && (
                            <span className="eq" role="img" aria-label="falando">
                              <i />
                              <i />
                              <i />
                            </span>
                          )}
                          {p.sharing && <span className="live sm-live">AO VIVO</span>}
                          {p.muted && !p.deafened && <MicOff size={14} aria-label="microfone desligado" />}
                          {p.deafened && <HeadphoneOff size={14} aria-label="fone desligado" />}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="room-empty">Ninguém aqui agora</span>
                )}
              </button>
              <IconButton
                size="sm"
                className="room-gear"
                label={room.role === "owner" ? `Configurações de ${room.name}` : `Membros de ${room.name}`}
                onClick={() => onRoomSettings(room.id)}
              >
                <Settings size={15} aria-hidden="true" />
              </IconButton>
            </div>
          );
        })}
      </div>

      {voice.room && (
        <div className="side-call">
          <div className="row">
            <span className={`dot ${connected ? "" : "pending"}`} aria-hidden="true" />
            <button className="grow side-call-info" onClick={() => callRoom && onOpenRoom(callRoom)} data-tip="Ver a sala">
              <strong>Na toca · {callRoom?.name ?? "…"}</strong>
              <span>{connected ? "Voz conectada" : connectionLabel(voice.connection)}</span>
            </button>
            <IconButton label="Sair da sala" size="sm" className="leave" onClick={() => void voice.leave()}>
              <PhoneOff size={15} aria-hidden="true" />
            </IconButton>
          </div>
          {/* Atalhos para mutar sem voltar para a sala (o resto fica na barra de controles) */}
          <div className="side-call-ctrl" role="toolbar" aria-label="Atalhos da chamada">
            <MicToggle
              track={voice.micMediaTrack}
              muted={voice.muted}
              disabled={!connected}
              onToggle={() => void voice.toggleMute()}
            />
            <IconButton
              size="sm"
              className={voice.deafened ? "off" : ""}
              label={voice.deafened ? "Voltar a ouvir a sala" : "Parar de ouvir a sala"}
              aria-pressed={voice.deafened}
              onClick={() => void voice.toggleDeafen()}
            >
              {voice.deafened ? <HeadphoneOff size={15} aria-hidden="true" /> : <Headphones size={15} aria-hidden="true" />}
            </IconButton>
          </div>
        </div>
      )}

      <div className="side-foot">
        <div className="me">
          <button className="me-id" onClick={onProfile} data-tip="Minha conta">
            <Avatar kind={me.avatar} size={38} mine presence={voice.room ? "call" : online ? "online" : "offline"} />
            <span className="grow">
              <strong>{me.displayName}</strong>
              <span>@{me.username}</span>
            </span>
          </button>
          <IconButton
            size="sm"
            solid={view === "friends"}
            className="with-badge"
            label={incomingCount > 0 ? `Amigos (${incomingCount} ${incomingCount === 1 ? "pedido" : "pedidos"})` : "Amigos"}
            aria-current={view === "friends" ? "page" : undefined}
            onClick={onFriends}
          >
            <Users size={18} aria-hidden="true" />
            {incomingCount > 0 && (
              <span className="badge count" aria-hidden="true">
                {incomingCount}
              </span>
            )}
          </IconButton>
          <IconButton size="sm" label="Configurações de voz e vídeo" onClick={onSettings}>
            <SlidersHorizontal size={18} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="ver">
          <span>Toca{version ? ` v${version}` : ""}</span>
          <span role="status">{versionNote}</span>
        </div>
      </div>
    </aside>
  );
}

// Separado: o volume atualiza ~20x por segundo e só ele re-renderiza
function MicToggle({
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
    <IconButton
      size="sm"
      className={`mic ${muted ? "off" : ""} ${speaking ? "speaking" : ""}`}
      style={{ "--level": level } as React.CSSProperties}
      label={muted ? "Ligar microfone" : "Desligar microfone"}
      aria-pressed={muted}
      disabled={disabled}
      onClick={onToggle}
    >
      {muted ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
    </IconButton>
  );
}

export function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case ConnectionState.Connecting:
      return "Conectando…";
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return "Reconectando…";
    case ConnectionState.Connected:
      return "Conectado";
    default:
      return "Desconectado";
  }
}
