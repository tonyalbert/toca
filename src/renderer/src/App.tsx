import { useCallback, useEffect, useRef, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import {
  acceptFriendRequest,
  isProfileComplete,
  logout,
  onSessionLost,
  restoreSession,
  type Account,
  type Profile,
  type RoomInfo,
} from "./api";
import type { RealtimeEvent } from "./realtime";
import type { UpdateState } from "../../shared/update";
import { getNotifyPrefs } from "./notifyPrefs";
import { useVoiceRoom } from "./useVoiceRoom";
import { useTocaData } from "./useTocaData";
import { useAppUpdate } from "./useAppUpdate";
import { AuthScreen } from "./AuthScreen";
import { AuthHeading, AuthLayout } from "./components/AuthLayout";
import { Avatar, avatarMap } from "./components/Avatar";
import { Button, IconButton } from "./components/Button";
import { RoomIcon } from "./components/RoomIcon";
import { TitleBar } from "./components/TitleBar";
import { useToast, type ToastOptions } from "./components/Toasts";
import { Sidebar } from "./Sidebar";
import { FriendsPage } from "./FriendsPage";
import { ProfileSetup } from "./ProfileSetup";
import { CreateRoomModal, RoomModal, type RoomModalTab } from "./RoomModals";
import { ScreenSharePicker } from "./ScreenSharePicker";
import { SettingsPage, type SettingsSection } from "./SettingsPage";
import { VoiceRoomView } from "./VoiceRoomView";
import { PersonPopover } from "./components/PersonPopover";
import { PeopleProvider, findPerson, type People } from "./people";
import { MAX_VOLUME } from "./useVoiceRoom";

const RESTORE_RETRY_MS = 5000;

// Volta para a mesma sala depois de atualizar: a sala atual fica guardada, e
// "Atualizar" marca o reinício. Na volta, só entra se a marca for recente.
const LAST_ROOM_KEY = "toca.lastRoom";
const REJOIN_KEY = "toca.rejoinAfterUpdate";
const REJOIN_WINDOW_MS = 5 * 60_000;

function markRejoin() {
  try {
    localStorage.setItem(REJOIN_KEY, String(Date.now()));
  } catch {
    // sem armazenamento: só não volta sozinho
  }
}

/** Sala para voltar depois de uma atualização (lida uma vez, ao abrir) */
function takeRejoinRoom(): string | null {
  try {
    const at = Number(localStorage.getItem(REJOIN_KEY));
    localStorage.removeItem(REJOIN_KEY);
    if (!at || Date.now() - at > REJOIN_WINDOW_MS) return null;
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

type Auth =
  | { status: "loading" }
  | { status: "offline"; message: string }
  | { status: "signedOut"; notice?: string }
  | { status: "signedIn"; account: Account };

export default function App() {
  const [auth, setAuth] = useState<Auth>({ status: "loading" });
  const { version, update, install: installNow } = useAppUpdate();
  const install = () => {
    markRejoin();
    installNow();
  };

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
            onInstall={install}
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

/** Aviso do Windows (só com o Toca em segundo plano e se a pessoa quiser) */
function windowsNotification(title: string, body: string) {
  if (!getNotifyPrefs().windowsWhenHidden) return;
  try {
    new Notification(title, { body });
  } catch {
    // notificações indisponíveis
  }
}

type View = "friends" | "voice" | "config";

function MainApp({
  me,
  version,
  update,
  onInstall,
  onMeChange,
  onLogout,
}: {
  me: Profile;
  version: string | null;
  update: UpdateState;
  onInstall: () => void;
  onMeChange: (me: Profile) => void;
  onLogout: () => void;
}) {
  const voice = useVoiceRoom();
  const toast = useToast();
  // A tela inicial é a de amigos (também ao sair de uma sala)
  const [view, setView] = useState<View>("friends");
  const [section, setSection] = useState<SettingsSection>("profile");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Janela da sala aberta (Membros pelo botão da sala, Sala pela engrenagem)
  const [roomModal, setRoomModal] = useState<{ id: string; tab: RoomModalTab } | null>(null);
  const [hiddenUpdate, setHiddenUpdate] = useState<string | null>(null);
  const [rejoinRoom, setRejoinRoom] = useState(takeRejoinRoom);
  // Cartão da pessoa aberto (volume e amizade)
  const [personCard, setPersonCard] = useState<{ userId: string; anchor: Element } | null>(null);
  const closePerson = useCallback(() => setPersonCard(null), []);

  const { leave, showError } = voice;
  const currentRoomId = voice.room;
  // Os eventos chegam antes de existir "data"; as ações dos avisos usam estas referências
  const reloadFriendsRef = useRef<() => Promise<void>>(async () => {});
  const friendsRef = useRef(new Map<string, string>());

  /** Aviso dentro do app com o Toca em foco; senão, pelo Windows */
  const alert = useCallback(
    (options: ToastOptions) => {
      if (document.hasFocus()) toast(options);
      else windowsNotification(options.title, options.sub ?? "");
    },
    [toast],
  );

  const goToRoom = useCallback(
    (roomId: string) => {
      setView("voice");
      if (roomId !== voice.room) void voice.join(roomId);
    },
    [voice],
  );

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      const prefs = getNotifyPrefs();
      switch (event.type) {
        case "friend_request_received": {
          if (!prefs.friendRequests) break;
          const { user, id } = event.request;
          alert({
            art: <Avatar kind={user.avatar} size={40} />,
            title: `${user.displayName} quer ser seu amigo`,
            sub: `@${user.username}`,
            actions: [
              {
                label: "Aceitar",
                primary: true,
                onClick: () =>
                  acceptFriendRequest(id)
                    .then(() => reloadFriendsRef.current())
                    .catch((err: Error) => toast({ kind: "error", title: err.message })),
              },
              { label: "Agora não", onClick: () => {} },
            ],
          });
          break;
        }
        case "friend_request_accepted":
          if (prefs.friendRequests) {
            alert({
              art: <Avatar kind={event.friend.avatar} size={40} />,
              title: `Você e ${event.friend.displayName} agora são amigos`,
              sub: `@${event.friend.username}`,
            });
          }
          break;
        case "room_added":
          if (event.room.role === "member" && prefs.roomAdded) {
            const owner = friendsRef.current.get(event.room.ownerId);
            alert({
              art: (
                <span className="room-ico toast-room" aria-hidden="true">
                  <RoomIcon icon={event.room.icon} size={20} />
                </span>
              ),
              title: `Você entrou na ${event.room.name}`,
              sub: owner ? `${owner} te adicionou` : "Agora ela aparece nas suas tocas",
              actions: [{ label: "Entrar agora", primary: true, onClick: () => goToRoom(event.room.id) }],
            });
          }
          break;
        case "user_updated":
          // Trocou o nome ou o bichinho em outro PC
          if (event.user.id === me.id) onMeChange({ ...me, displayName: event.user.displayName, avatar: event.user.avatar });
          break;
        case "room_removed":
        case "room_deleted":
          // Removido da sala em que está: sai da call (o LiveKit também derruba)
          if (event.roomId === currentRoomId) {
            void leave().then(() => showError(event.type === "room_deleted" ? "A sala foi excluída." : "Você foi removido da sala."));
          }
          break;
      }
    },
    [alert, toast, goToRoom, currentRoomId, leave, showError, me, onMeChange],
  );

  const data = useTocaData(handleEvent);
  const { reloadRooms, reloadFriends } = data;
  reloadFriendsRef.current = reloadFriends;
  friendsRef.current = new Map(data.friends.map((f) => [f.id, f.displayName]));

  // Guarda a sala atual (para voltar a ela depois de uma atualização)
  useEffect(() => {
    try {
      if (voice.room) localStorage.setItem(LAST_ROOM_KEY, voice.room);
      else localStorage.removeItem(LAST_ROOM_KEY);
    } catch {
      // sem armazenamento
    }
  }, [voice.room]);

  // Acabou de atualizar no meio de uma chamada: volta para a mesma sala
  useEffect(() => {
    if (!rejoinRoom || !data.roomsLoaded) return;
    setRejoinRoom(null);
    const room = data.rooms.find((r) => r.id === rejoinRoom);
    if (!room) return;
    goToRoom(room.id);
    toast({ title: `Você voltou para a ${room.name}`, sub: "O Toca foi atualizado." });
  }, [rejoinRoom, data.roomsLoaded, data.rooms, goToRoom, toast]);

  // Erros da chamada viram aviso
  const { error: voiceError, clearError } = voice;
  useEffect(() => {
    if (!voiceError) return;
    toast({ kind: "error", title: voiceError });
    clearError();
  }, [voiceError, clearError, toast]);

  // Atualiza quem está nas salas logo após entrar/sair, e de novo um pouco
  // depois, quando o LiveKit já processou a saída
  useEffect(() => {
    void reloadRooms();
    const id = setTimeout(reloadRooms, 1500);
    return () => clearTimeout(id);
  }, [voice.room, voice.connection, reloadRooms]);

  const currentRoom = data.rooms.find((r) => r.id === voice.room);
  const modalRoom = roomModal && data.rooms.find((r) => r.id === roomModal.id);
  // O que aparece na área principal
  const shown: View = view === "voice" && !voice.room ? "friends" : view;

  const joinRoom = (room: RoomInfo) => goToRoom(room.id);
  const openSettings = (s: SettingsSection) => {
    setSection(s);
    setView("config");
  };

  const people: People = {
    me,
    friends: data.friends,
    incoming: data.incoming,
    outgoing: data.outgoing,
    rooms: data.rooms,
    reloadFriends,
    openPerson: (userId, anchor) =>
      setPersonCard((open) => (open?.userId === userId && open.anchor === anchor ? null : { userId, anchor })),
  };
  const cardPerson = personCard && findPerson(people, personCard.userId);
  const cardInCall = personCard && voice.participants.find((p) => p.identity === personCard.userId && !p.isLocal);

  const signOut = async () => {
    await voice.leave();
    await logout();
    onLogout();
  };

  return (
    <PeopleProvider value={people}>
      <Sidebar
        me={me}
        rooms={data.rooms}
        friends={data.friends}
        incomingCount={data.incoming.length}
        online={data.online}
        voice={voice}
        version={version}
        update={update}
        view={shown}
        onOpenRoom={joinRoom}
        onRoomSettings={(id) => setRoomModal({ id, tab: "room" })}
        onCreateRoom={() => setCreateOpen(true)}
        onFriends={() => setView("friends")}
        onSettings={() => openSettings("voice")}
        onProfile={() => openSettings("profile")}
      />

      <main className="main">
        {update.status === "downloaded" && hiddenUpdate !== update.version && (
          <div className="banner" role="status">
            <Download size={18} aria-hidden="true" className="banner-ico" />
            <span className="grow">
              <strong>Nova versão disponível: {update.version}.</strong>{" "}
              <span className="muted">Leva uns segundos{voice.room ? " e você volta para a mesma sala" : ""}.</span>
            </span>
            <Button variant="primary" size="sm" onClick={onInstall}>
              Atualizar
            </Button>
            <IconButton size="sm" label="Lembrar depois" onClick={() => setHiddenUpdate(update.version)}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          </div>
        )}

        {shown === "voice" ? (
          <VoiceRoomView
            room={currentRoom}
            voice={voice}
            avatars={avatarMap(me, data.friends, data.rooms)}
            onMembers={() => currentRoom && setRoomModal({ id: currentRoom.id, tab: "members" })}
            onShareScreen={() => setPickerOpen(true)}
          />
        ) : shown === "config" ? (
          <SettingsPage
            me={me}
            voice={voice}
            section={section}
            onSection={setSection}
            onMeChange={onMeChange}
            onSignOut={() => void signOut()}
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
        {personCard && cardPerson && (
          <PersonPopover
            key={personCard.userId}
            person={cardPerson}
            anchor={personCard.anchor}
            isMe={personCard.userId === me.id}
            volume={cardInCall ? cardInCall.volume : undefined}
            maxVolume={MAX_VOLUME}
            onVolume={cardInCall ? (v) => voice.setParticipantVolume(personCard.userId, v) : undefined}
            screenVolume={cardInCall?.hasScreenAudio ? cardInCall.screenVolume : undefined}
            onScreenVolume={
              cardInCall?.hasScreenAudio ? (v) => voice.setParticipantVolume(personCard.userId, v, "screen") : undefined
            }
            onEditProfile={() => {
              setPersonCard(null);
              openSettings("profile");
            }}
            onClose={closePerson}
          />
        )}
      </main>
    </PeopleProvider>
  );
}
