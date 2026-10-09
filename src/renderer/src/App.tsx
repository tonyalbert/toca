import { useCallback, useEffect, useState } from "react";
import { ConnectionState } from "livekit-client";
import { fetchRooms, type RoomInfo } from "./api";
import type { UpdateState } from "../../shared/update";
import { useVoiceRoom, type VoiceParticipant } from "./useVoiceRoom";
import { useAppUpdate } from "./useAppUpdate";
import { useMicLevel } from "./useMicLevel";
import { GearIcon, HangUpIcon, MicIcon, MicOffIcon, SpeakerIcon } from "./icons";
import { VoiceSettings } from "./VoiceSettings";

const NAME_KEY = "toca.name";
const ROOMS_POLL_MS = 5000;

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // sem armazenamento: o nome só vale nesta sessão
  }
}

export default function App() {
  const [name, setName] = useState(loadName);
  const { version, update, install } = useAppUpdate();

  return (
    <>
      {name ? (
        <VoiceApp
          name={name}
          version={version}
          onChangeName={() => {
            saveName("");
            setName("");
          }}
        />
      ) : (
        <NameScreen
          version={version}
          onSubmit={(n) => {
            saveName(n);
            setName(n);
          }}
        />
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

function NameScreen({ version, onSubmit }: { version: string | null; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(loadName);
  const trimmed = value.trim();

  return (
    <div className="name-screen">
      <form
        className="name-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <h1>Toca</h1>
        <p>Como você quer ser chamado?</p>
        <input
          autoFocus
          maxLength={32}
          placeholder="Seu nome"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="primary" disabled={!trimmed}>
          Entrar
        </button>
        {version && <div className="version">v{version}</div>}
      </form>
    </div>
  );
}

function VoiceApp({
  name,
  version,
  onChangeName,
}: {
  name: string;
  version: string | null;
  onChangeName: () => void;
}) {
  const voice = useVoiceRoom();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refreshRooms = useCallback(async () => {
    try {
      setRooms(await fetchRooms());
      setRoomsError(null);
    } catch (err) {
      setRoomsError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshRooms();
    const id = setInterval(refreshRooms, ROOMS_POLL_MS);
    return () => clearInterval(id);
  }, [refreshRooms]);

  // Atualiza a lista logo após entrar/sair, sem esperar o próximo ciclo,
  // e de novo um pouco depois, quando o LiveKit já processou a saída.
  useEffect(() => {
    void refreshRooms();
    const id = setTimeout(refreshRooms, 1500);
    return () => clearTimeout(id);
  }, [voice.room, voice.connection, refreshRooms]);

  const connected = voice.connection === ConnectionState.Connected;
  const currentRoom = rooms.find((r) => r.slug === voice.room);

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-header">
          <span>Toca</span>
          {version && <span className="version">v{version}</span>}
        </header>

        <nav className="room-list">
          <div className="section-title">Salas de voz</div>
          {roomsError && rooms.length === 0 && (
            <div className="muted-text">Não foi possível carregar as salas.</div>
          )}
          {rooms.map((room) => {
            const isCurrent = room.slug === voice.room;
            return (
              <div key={room.slug} className="room">
                <button
                  className={`room-button ${isCurrent ? "active" : ""}`}
                  onClick={() => !isCurrent && void voice.join(name, room.slug)}
                  title={isCurrent ? "Você está nesta sala" : `Entrar em ${room.name}`}
                >
                  <SpeakerIcon />
                  <span>{room.name}</span>
                </button>
                <ul className="room-members">
                  {isCurrent && connected
                    ? voice.participants.map((p) => <MemberRow key={p.identity} p={p} />)
                    : room.participants
                        .filter((p) => !voice.isOwnIdentity(p.identity))
                        .map((p) => (
                        <li key={p.identity} className="member">
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
          {voice.room && (
            <div className="voice-status">
              <div>
                <div className={`status-line ${connected ? "ok" : "pending"}`}>
                  {connected ? "Voz conectada" : connectionLabel(voice.connection)}
                </div>
                <div className="muted-text">{currentRoom?.name ?? voice.room}</div>
              </div>
              <button className="icon-button danger" onClick={() => void voice.leave()} title="Sair da sala">
                <HangUpIcon />
              </button>
            </div>
          )}
          <div className="user-row">
            <Avatar name={name} size={32} />
            <div className="user-info">
              <div className="user-name">{name}</div>
              <button className="link-button" onClick={() => void voice.leave().then(onChangeName)}>
                trocar nome
              </button>
            </div>
            <MicButton
              track={voice.micMediaTrack}
              muted={voice.muted}
              disabled={!connected}
              onToggle={() => void voice.toggleMute()}
            />
            <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Configurações de voz">
              <GearIcon />
            </button>
          </div>
        </footer>
      </aside>

      <main className="stage">
        {voice.room ? (
          <>
            <header className="stage-header">
              <SpeakerIcon />
              <span>{currentRoom?.name ?? voice.room}</span>
            </header>
            {connected ? (
              <div className="tiles">
                {voice.participants.map((p) => (
                  <div key={p.identity} className={`tile ${p.isSpeaking ? "speaking" : ""}`}>
                    <Avatar name={p.name} size={72} />
                    <div className="tile-name">
                      {p.isMuted && <MicOffIcon />}
                      {p.name}
                      {p.isLocal && " (você)"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">{connectionLabel(voice.connection)}</div>
            )}
          </>
        ) : (
          <div className="empty">Escolha uma sala na lista para entrar.</div>
        )}

        {settingsOpen && (
          <VoiceSettings
            micDeviceId={voice.micDeviceId}
            onChangeMic={(id) => void voice.setMicDevice(id)}
            onClose={() => setSettingsOpen(false)}
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

function MemberRow({ p }: { p: VoiceParticipant }) {
  return (
    <li className={`member ${p.isSpeaking ? "speaking" : ""}`}>
      <Avatar name={p.name} size={22} />
      <span className="member-name">{p.name}</span>
      {p.isMuted && <MicOffIcon className="member-icon" />}
    </li>
  );
}

function Avatar({ name, size }: { name: string; size: number }) {
  // Cor estável por nome
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `hsl(${hue} 45% 45%)`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
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
