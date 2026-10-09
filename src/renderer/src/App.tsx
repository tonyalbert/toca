import { useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { isProfileComplete, logout, onSessionLost, restoreSession, type Account, type Profile, type RoomInfo } from "./api";
import type { RealtimeEvent } from "./realtime";
import type { UpdateState } from "../../shared/update";
import { useVoiceRoom } from "./useVoiceRoom";
import { useTocaData } from "./useTocaData";
import { useAppUpdate } from "./useAppUpdate";
import { AuthScreen } from "./AuthScreen";
import { AuthHeading, AuthLayout } from "./components/AuthLayout";
import { TitleBar } from "./components/TitleBar";
import { avatarMap } from "./components/Avatar";
import { Sidebar } from "./Sidebar";
import { FriendsPage } from "./FriendsPage";
import { ProfileModal } from "./ProfileModal";
import { ProfileSetup } from "./ProfileSetup";
import { CreateRoomModal, RoomModal, type RoomModalTab } from "./RoomModals";
import { ScreenSharePicker } from "./ScreenSharePicker";
import { VoiceRoomView } from "./VoiceRoomView";
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
    <div className="win">
      <TitleBar update={update} onInstall={install} />
      <div className="app-body">
      {auth.status === "signedIn" && isProfileComplete(auth.account) ? (
        <MainApp
          key={auth.account.id}
          me={auth.account}
          version={version}
          update={update}
          onMeChange={(account) => setAuth({ status: "signedIn", account })}
          onLogout={() => setAuth({ status: "signedOut" })}
        />
      ) : auth.status === "signedIn" ? (
        <ProfileSetup
          account={auth.account}
          version={version}
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
        <AuthLayout version={version}>
          {auth.status === "offline" ? (
            <>
              <AuthHeading title="Sem conexão">Não deu para falar com o servidor. Tentando de novo sozinho…</AuthHeading>
              <div className="notice" role="status">
                <WifiOff size={16} aria-hidden="true" />
                <span className="muted">{auth.message}</span>
              </div>
            </>
          ) : (
            <AuthHeading title="Entrando…" />
          )}
        </AuthLayout>
      )}
      </div>
    </div>
  );
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
  update,
  onMeChange,
  onLogout,
}: {
  me: Profile;
  version: string | null;
  update: UpdateState;
  onMeChange: (me: Profile) => void;
  onLogout: () => void;
}) {
  const voice = useVoiceRoom();
  const [view, setView] = useState<"friends" | "voice">("friends");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Janela da sala aberta (Membros pelo botão da sala, Sala pela engrenagem)
  const [roomModal, setRoomModal] = useState<{ id: string; tab: RoomModalTab } | null>(null);
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
          if (event.user.id === me.id) onMeChange({ ...me, displayName: event.user.displayName, avatar: event.user.avatar });
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

  const currentRoom = data.rooms.find((r) => r.id === voice.room);
  const modalRoom = roomModal && data.rooms.find((r) => r.id === roomModal.id);
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
    <>
      <Sidebar
        me={me}
        rooms={data.rooms}
        friends={data.friends}
        incomingCount={data.incoming.length}
        online={data.online}
        voice={voice}
        version={version}
        update={update}
        view={showVoice ? "voice" : "friends"}
        onOpenRoom={joinRoom}
        onRoomSettings={(id) => setRoomModal({ id, tab: "room" })}
        onCreateRoom={() => setCreateOpen(true)}
        onFriends={() => setView("friends")}
        onSettings={() => setSettingsOpen(true)}
        onProfile={() => setProfileOpen(true)}
      />

      <main className="main">
        {showVoice ? (
          <VoiceRoomView
            room={currentRoom}
            voice={voice}
            avatars={avatarMap(me, data.friends, data.rooms)}
            onMembers={() => currentRoom && setRoomModal({ id: currentRoom.id, tab: "members" })}
            onShareScreen={() => setPickerOpen(true)}
          />
        ) : (
          <FriendsPage
            myUsername={me.username}
            friends={data.friends}
            incoming={data.incoming}
            outgoing={data.outgoing}
            rooms={data.rooms}
            currentRoomId={voice.room}
            onChanged={reloadFriends}
            onJoinRoom={joinRoom}
          />
        )}

        {pickerOpen && (
          <ScreenSharePicker
            onShare={(sourceId, withAudio, sourceName) => {
              setPickerOpen(false);
              void voice.startScreenShare(sourceId, withAudio, sourceName);
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
            friends={data.friends}
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              void reloadRooms();
            }}
          />
        )}

        {modalRoom && (
          <RoomModal
            key={modalRoom.id}
            room={modalRoom}
            me={me}
            friends={data.friends}
            initialTab={roomModal.tab}
            onChanged={reloadRooms}
            onLeft={() => {
              setRoomModal(null);
              if (modalRoom.id === voice.room) void voice.leave();
            }}
            onClose={() => setRoomModal(null)}
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
    </>
  );
}
