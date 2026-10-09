import { useCallback, useEffect, useState } from "react";
import { ConnectionState } from "livekit-client";
import { isProfileComplete, logout, onSessionLost, restoreSession, type Account, type Profile, type RoomInfo } from "./api";
import type { RealtimeEvent } from "./realtime";
import type { UpdateState } from "../../shared/update";
import { useVoiceRoom, type VoiceParticipant } from "./useVoiceRoom";
import { useTocaData } from "./useTocaData";
import { useAppUpdate } from "./useAppUpdate";
import { useMicLevel } from "./useMicLevel";
import {
  CameraIcon,
  CameraOffIcon,
  GearIcon,
  HangUpIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  MicIcon,
  MicOffIcon,
  PlusIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  SpeakerIcon,
  UsersIcon,
} from "./icons";
import { AuthScreen } from "./AuthScreen";
import { Avatar } from "./Avatar";
import { FriendsPage } from "./FriendsPage";
import { ProfileModal } from "./ProfileModal";
import { ProfileSetup } from "./ProfileSetup";
import { CreateRoomModal, RoomSettingsModal } from "./RoomModals";
import { ScreenSharePicker } from "./ScreenSharePicker";
import { Stage } from "./Stage";
import { VoiceSettings } from "./VoiceSettings";

const RESTORE_RETRY_MS = 5000;

type Auth =
  | { status: "loading" }
  | { status: "offline"; message: string }
  | { status: "signedOut"; notice?: string }
  | { status: "signedIn"; account: Account };

export default function App() {
  const [auth, setAuth] = useState<Auth>({ status: "loading" });
  const { version, update, install } = useAppUpdate();

  // Retoma a sessão salva; sem internet, tenta de novo sozinho
  useEffect(() => {
    if (auth.status !== "loading" && auth.status !== "offline") return;
    let cancelled = false;
    const attempt = async () => {
      try {
        const user = await restoreSession();
        if (!cancelled) setAuth(user ? { status: "signedIn", account: user } : { status: "signedOut" });
      } catch (err) {
        if (cancelled) return;
        setAuth({ status: "offline", message: (err as Error).message });
      }
    };
    const id = setTimeout(attempt, auth.status === "offline" ? RESTORE_RETRY_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [auth]);

  useEffect(() => {
    onSessionLost(() => setAuth({ status: "signedOut", notice: "Sua sessão expirou. Entre de novo." }));
  }, []);

  return (
    <>
      {auth.status === "signedIn" && isProfileComplete(auth.account) ? (
        <MainApp
          key={auth.account.id}
          me={auth.account}
          version={version}
          onMeChange={(account) => setAuth({ status: "signedIn", account })}
          onLogout={() => setAuth({ status: "signedOut" })}
        />
      ) : auth.status === "signedIn" ? (
        <ProfileSetup
          account={auth.account}
          onDone={(account) => setAuth({ status: "signedIn", account })}
          onCancel={() => void logout().then(() => setAuth({ status: "signedOut" }))}
        />
      ) : auth.status === "signedOut" ? (
        <AuthScreen
          version={version}
          notice={auth.notice}
          onAuthenticated={(account) => setAuth({ status: "signedIn", account })}
        />
      ) : (
        <div className="name-screen">
          <div className="name-card">
            <h1>Toca</h1>
            {auth.status === "offline" ? (
              <>
                <p>Sem conexão com o servidor.</p>
                <div className="muted-text">Tentando de novo… ({auth.message})</div>
              </>
            ) : (
              <p>Carregando…</p>
            )}
          </div>
        </div>
      )}
      <UpdateBanner update={update} onInstall={install} />
    </>
  );
}

function UpdateBanner({ update, onInstall }: { update: UpdateState; onInstall: () => void }) {
  if (update.status === "downloading") {
    return (
      <div className="update-banner subtle">
        Baixando a versão {update.version}… {update.percent}%
      </div>
    );
  }
  if (update.status === "downloaded") {
    return (
      <div className="update-banner" role="status">
        <span>
          Versão <strong>{update.version}</strong> pronta
        </span>
        <button className="primary small" onClick={onInstall} title="O app reinicia e a chamada atual é encerrada">
          Atualizar
        </button>
      </div>
    );
  }
  return null;
}

/** Notificação do Windows, só quando o Toca não está em foco */
function notify(title: string, body: string) {
  if (document.hasFocus()) return;
  try {
    new Notification(title, { body });
  } catch {
    // notificações indisponíveis
  }
}

function MainApp({
  me,
  version,
  onMeChange,
  onLogout,
}: {
  me: Profile;
  version: string | null;
  onMeChange: (me: Profile) => void;
  onLogout: () => void;
}) {
  const voice = useVoiceRoom();
  const [view, setView] = useState<"friends" | "voice">("friends");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [roomSettingsId, setRoomSettingsId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { leave, showError } = voice;
  const currentRoomId = voice.room;

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      switch (event.type) {
        case "friend_request_received":
          notify("Pedido de amizade", `${event.request.user.displayName} quer ser seu amigo`);
          break;
        case "friend_request_accepted":
          notify("Novo amigo", `Você e ${event.friend.displayName} agora são amigos`);
          break;
        case "room_added":
          if (event.room.role === "member") notify("Nova sala", `Você foi adicionado à sala ${event.room.name}`);
          break;
        case "user_updated":
          // Trocou o nome em outro PC
          if (event.user.id === me.id) onMeChange({ ...me, displayName: event.user.displayName });
          break;
        case "room_removed":
        case "room_deleted":
          // Removido da sala em que está: sai da call (o LiveKit também derruba)
          if (event.roomId === currentRoomId) {
            void leave().then(() =>
              showError(event.type === "room_deleted" ? "A sala foi excluída." : "Você foi removido da sala."),
            );
          }
          break;
      }
    },
    [currentRoomId, leave, showError, me, onMeChange],
  );

  const data = useTocaData(handleEvent);
  const { reloadRooms, reloadFriends } = data;

  // Atualiza quem está nas salas logo após entrar/sair, e de novo um pouco
  // depois, quando o LiveKit já processou a saída
  useEffect(() => {
    void reloadRooms();
    const id = setTimeout(reloadRooms, 1500);
    return () => clearTimeout(id);
  }, [voice.room, voice.connection, reloadRooms]);

  const connected = voice.connection === ConnectionState.Connected;
  const currentRoom = data.rooms.find((r) => r.id === voice.room);
  const settingsRoom = data.rooms.find((r) => r.id === roomSettingsId);
  const showVoice = view === "voice" && voice.room;

  const joinRoom = (room: RoomInfo) => {
    setView("voice");
    if (room.id !== voice.room) void voice.join(room.id);
  };

  const signOut = async () => {
    await voice.leave();
    await logout();
    onLogout();
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-header">
          <span>Toca</span>
          {version && <span className="version">v{version}</span>}
        </header>

        <nav className="room-list">
          <button
            className={`nav-button ${!showVoice ? "active" : ""}`}
            onClick={() => setView("friends")}
          >
            <UsersIcon />
            <span>Amigos</span>
            {data.incoming.length > 0 && <span className="badge">{data.incoming.length}</span>}
          </button>

          <div className="section-title with-action">
            <span>Salas de voz</span>
            <button className="mini-button" title="Criar sala" onClick={() => setCreateOpen(true)}>
              <PlusIcon />
            </button>
          </div>
          {data.roomsLoaded && data.rooms.length === 0 && (
            <div className="muted-text hint">Crie uma sala no + ou peça para um amigo te adicionar.</div>
          )}
          {data.rooms.map((room) => {
            const isCurrent = room.id === voice.room;
            return (
              <div key={room.id} className="room">
                <div className={`room-button ${isCurrent ? "active" : ""}`}>
                  <button
                    className="room-join"
                    onClick={() => joinRoom(room)}
                    title={isCurrent ? "Você está nesta sala" : `Entrar em ${room.name}`}
                  >
                    <SpeakerIcon />
                    <span>{room.name}</span>
                  </button>
                  <button
                    className="room-gear"
                    title={room.role === "owner" ? "Configurações da sala" : "Membros da sala"}
                    onClick={() => setRoomSettingsId(room.id)}
                  >
                    <GearIcon />
                  </button>
                </div>
                <ul className="room-members">
                  {isCurrent && connected
                    ? voice.participants.map((p) => (
                        <MemberRow key={p.identity} p={p} deafened={p.isLocal && voice.deafened} />
                      ))
                    : room.participants
                        .filter((p) => p.id !== me.id)
                        .map((p) => (
                          <li key={p.id} className="member">
                            <Avatar name={p.name} size={22} />
                            <span className="member-name">{p.name}</span>
                          </li>
                        ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <footer className="user-panel">
          {!data.online && <div className="offline-line">Conectando ao servidor…</div>}
          {voice.room && (
            <div className="voice-status">
              <button className="voice-status-info" onClick={() => setView("voice")} title="Ver a sala">
                <div className={`status-line ${connected ? "ok" : "pending"}`}>
                  {connected ? "Voz conectada" : connectionLabel(voice.connection)}
                </div>
                <div className="muted-text">{currentRoom?.name ?? "…"}</div>
              </button>
              <div className="voice-actions">
                <button
                  className={`icon-button ${voice.cameraOn ? "active" : ""}`}
                  onClick={() => void voice.toggleCamera()}
                  disabled={!connected}
                  title={voice.cameraOn ? "Desligar câmera" : "Ligar câmera"}
                >
                  {voice.cameraOn ? <CameraIcon /> : <CameraOffIcon />}
                </button>
                <button
                  className={`icon-button ${voice.screenSharing ? "sharing" : ""}`}
                  onClick={() => (voice.screenSharing ? void voice.stopScreenShare() : setPickerOpen(true))}
                  disabled={!connected}
                  title={voice.screenSharing ? "Parar de compartilhar" : "Compartilhar tela"}
                >
                  {voice.screenSharing ? <ScreenShareOffIcon /> : <ScreenShareIcon />}
                </button>
                <button className="icon-button danger" onClick={() => void voice.leave()} title="Sair da sala">
                  <HangUpIcon />
                </button>
              </div>
            </div>
          )}
          <div className="user-row">
            <button className="user-identity" onClick={() => setProfileOpen(true)} title="Minha conta">
              <Avatar name={me.displayName} size={32} />
              <div className="user-info">
                <div className="user-name">{me.displayName}</div>
                <div className="muted-text user-handle">@{me.username}</div>
              </div>
            </button>
            <MicButton
              track={voice.micMediaTrack}
              muted={voice.muted}
              disabled={!connected}
              onToggle={() => void voice.toggleMute()}
            />
            <button
              className={`icon-button ${voice.deafened ? "danger" : ""}`}
              onClick={() => void voice.toggleDeafen()}
              title={voice.deafened ? "Voltar a ouvir a sala" : "Parar de ouvir a sala (muta o fone)"}
            >
              {voice.deafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
            </button>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Configurações de voz e vídeo">
              <GearIcon />
            </button>
          </div>
        </footer>
      </aside>

      <main className="stage">
        {showVoice ? (
          <>
            <header className="stage-header">
              <SpeakerIcon />
              <span>{currentRoom?.name ?? "…"}</span>
              {voice.screenSharing && (
                <button className="stop-share" onClick={() => void voice.stopScreenShare()}>
                  <ScreenShareOffIcon />
                  Parar de compartilhar
                </button>
              )}
            </header>
            {connected ? (
              <Stage participants={voice.participants} />
            ) : (
              <div className="empty">{connectionLabel(voice.connection)}</div>
            )}
          </>
        ) : (
          <FriendsPage
            friends={data.friends}
            incoming={data.incoming}
            outgoing={data.outgoing}
            onChanged={reloadFriends}
          />
        )}

        {pickerOpen && (
          <ScreenSharePicker
            onShare={(sourceId, withAudio) => {
              setPickerOpen(false);
              void voice.startScreenShare(sourceId, withAudio);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {settingsOpen && (
          <VoiceSettings
            micDeviceId={voice.micDeviceId}
            cameraDeviceId={voice.cameraDeviceId}
            onChangeMic={(id) => void voice.setMicDevice(id)}
            onChangeCamera={(id) => void voice.setCameraDevice(id)}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {profileOpen && (
          <ProfileModal
            me={me}
            onSaved={onMeChange}
            onSignOut={() => {
              setProfileOpen(false);
              void signOut();
            }}
            onClose={() => setProfileOpen(false)}
          />
        )}

        {createOpen && (
          <CreateRoomModal
            onClose={() => setCreateOpen(false)}
            onCreated={async (room) => {
              setCreateOpen(false);
              await reloadRooms();
              // Já abre as configurações para adicionar amigos
              setRoomSettingsId(room.id);
            }}
          />
        )}

        {settingsRoom && (
          <RoomSettingsModal
            room={settingsRoom}
            me={me}
            friends={data.friends}
            onChanged={reloadRooms}
            onLeft={() => {
              setRoomSettingsId(null);
              if (settingsRoom.id === voice.room) void voice.leave();
            }}
            onClose={() => setRoomSettingsId(null)}
          />
        )}

        {voice.error && (
          <div className="toast" role="alert">
            <span>{voice.error}</span>
            <button className="link-button" onClick={voice.clearError}>
              fechar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// Componente separado: o volume atualiza ~20x por segundo e só ele re-renderiza
function MicButton({
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
    <button
      className={`icon-button mic ${muted ? "danger" : ""} ${speaking ? "speaking" : ""}`}
      style={{ "--level": level } as React.CSSProperties}
      onClick={onToggle}
      disabled={disabled}
      title={muted ? "Desmutar" : speaking ? "Seu microfone está captando som" : "Mutar"}
    >
      {muted ? <MicOffIcon /> : <MicIcon />}
    </button>
  );
}

function MemberRow({ p, deafened }: { p: VoiceParticipant; deafened: boolean }) {
  return (
    <li className={`member ${p.isSpeaking ? "speaking" : ""}`}>
      <Avatar name={p.name} size={22} />
      <span className="member-name">{p.name}</span>
      {p.screenTrack && <span className="live-badge">AO VIVO</span>}
      {p.cameraTrack && <CameraIcon className="member-icon camera" />}
      {p.isMuted && !deafened && <MicOffIcon className="member-icon" />}
      {deafened && <HeadphonesOffIcon className="member-icon" />}
    </li>
  );
}

function connectionLabel(state: ConnectionState): string {
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
