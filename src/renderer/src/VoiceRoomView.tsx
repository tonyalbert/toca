import { useEffect, useRef, useState } from "react";
import { ConnectionState } from "livekit-client";
import { Clapperboard, Gamepad2, LayoutGrid, Maximize, Minimize, ScreenShareOff, Users, MessageSquare } from "lucide-react";
import type { RoomInfo } from "./api";
import type { Look } from "./components/Avatar";
import { MAX_VOLUME, type VoiceParticipant, type VoiceRoom } from "./useVoiceRoom";
import { connectionLabel } from "./Sidebar";
import { Button, IconButton } from "./components/Button";
import { CallControls } from "./components/CallControls";
import { ParticipantCard, type TileVariant } from "./components/ParticipantCard";
import { RoomIcon } from "./components/RoomIcon";
import { VideoView } from "./components/VideoView";
import { VolumeControl } from "./components/VolumeControl";
import { usePeople } from "./people";
import { useFitGrid } from "./useFitGrid";
import { useAudioSettings } from "./audioSettings";
import type { Cinema } from "./cinema";
import { CinemaStartModal, CinemaView } from "./CinemaView";
import type { DrawGame } from "./drawGame";
import { DrawGameView, lastDrawSettings } from "./DrawGameView";
import type { Duel } from "./duel";
import { DuelView } from "./DuelView";
import { GamesModal } from "./GamesModal";

/** Um quadro da sala: a câmera (ou o bichinho) de alguém, ou uma tela compartilhada */
interface Tile {
  key: string;
  kind: "person" | "screen";
  p: VoiceParticipant;
}

/** Quadros que dá para ampliar: telas e câmeras ligadas */
const zoomable = (t: Tile) => t.kind === "screen" || !!t.p.cameraTrack;

/**
 * Sala de voz. Sem destaque, todos os quadros ficam numa grade. Clicar numa
 * câmera ou tela coloca ela em destaque e o resto vai para a faixa ao lado
 * (com vídeo). Quando alguém começa a compartilhar, a tela vai sozinha para o
 * destaque, a menos que você já tenha escolhido o que ver.
 */
export function VoiceRoomView({
  room,
  voice,
  avatars,
  onMembers,
  onShareScreen,
  chatOpen,
  chatUnread,
  onToggleChat,
  cinema,
  draw,
  duel,
}: {
  room: RoomInfo | undefined;
  voice: VoiceRoom;
  avatars: Map<string, Look>;
  /** Abre a janela de membros da sala */
  onMembers: () => void;
  /** Abre o seletor de tela */
  onShareScreen: () => void;
  /** Chat da sala aberto ao lado */
  chatOpen: boolean;
  chatUnread: number;
  onToggleChat: () => void;
  /** Sessão de cinema da chamada */
  cinema: Cinema;
  /** Jogo da chamada (Desenha e Adivinha) */
  draw: DrawGame;
  /** Jogo de 2 da chamada (Lig 4…) */
  duel: Duel;
}) {
  // Escolher o vídeo (começar ou trocar)
  const [cinemaPick, setCinemaPick] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const playing = !!draw.game || !!duel.session;
  const { openPerson } = usePeople();
  const [audio] = useAudioSettings();
  const connected = voice.connection === ConnectionState.Connected;
  const people = voice.participants;
  const others = people.filter((p) => !p.isLocal);

  // Telas primeiro (as dos outros antes da sua), depois as pessoas
  const screenTiles: Tile[] = people
    .filter((p) => p.screenTrack)
    .sort((a, b) => Number(a.isLocal) - Number(b.isLocal))
    .map((p) => ({ key: `screen:${p.identity}`, kind: "screen", p }));
  const tiles: Tile[] = [...screenTiles, ...people.map((p): Tile => ({ key: `person:${p.identity}`, kind: "person", p }))];
  const remoteScreens = screenTiles.filter((t) => !t.p.isLocal);

  const [focusKey, setFocusKey] = useState<string | null>(null);
  // Você escolheu o que ver (destaque ou grade): telas novas não tomam o lugar
  const chose = useRef(false);
  const known = useRef<string[]>([]);
  const remoteKeys = remoteScreens.map((t) => t.key).join(",");
  const allScreenKeys = screenTiles.map((t) => t.key).join(",");
  useEffect(() => {
    const remote = remoteKeys ? remoteKeys.split(",") : [];
    const all = allScreenKeys ? allScreenKeys.split(",") : [];
    if (remote.length === 0) chose.current = false;
    const started = remote.find((k) => !known.current.includes(k));
    setFocusKey((key) => {
      // Tela nova vai para o destaque, mas não tira outra tela que você já está vendo
      if (started && !chose.current && !key?.startsWith("screen:")) return started;
      // A tela em destaque acabou: vai para outra tela dos outros, ou volta para a grade
      if (key?.startsWith("screen:") && !all.includes(key)) return chose.current ? null : (remote[0] ?? null);
      return key;
    });
    known.current = remote;
  }, [remoteKeys, allScreenKeys]);

  const focused = tiles.find((t) => t.key === focusKey && zoomable(t));
  // Grade 16:9 que cabe na área (o elemento só existe quando ninguém está em destaque)
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const fit = useFitGrid(focused ? null : gridEl, tiles.length);
  // Câmera em destaque desligou (ou a pessoa saiu): volta para a grade
  useEffect(() => {
    if (focusKey && !focused) setFocusKey(null);
  }, [focusKey, focused]);
  // Só conta como escolha se já houver tela dos outros (antes disso, a primeira tela ainda vai para o destaque)
  const focus = (key: string) => {
    if (remoteScreens.length > 0) chose.current = true;
    setFocusKey(key);
  };
  const toGrid = () => {
    if (remoteScreens.length > 0) chose.current = true;
    setFocusKey(null);
  };

  // Tela cheia do destaque
  const mainRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement && document.fullscreenElement === mainRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mainRef.current?.requestFullscreen();
  };

  // Esc volta para a grade (se nada estiver aberto por cima)
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.fullscreenElement) return;
      if (document.querySelector(".sheet-ov, .dialog-ov, .vol-pop, .menu-list, .select-list")) return;
      toGrid();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  const renderTile = (t: Tile, variant: TileVariant) => {
    const { p } = t;
    if (t.kind === "screen") {
      return (
        <ScreenTile
          key={t.key}
          p={p}
          variant={variant}
          onScreenVolume={(v) => voice.setParticipantVolume(p.identity, v, "screen")}
          onActivate={variant === "main" ? undefined : () => focus(t.key)}
        />
      );
    }
    return (
      <ParticipantCard
        key={t.key}
        variant={variant}
        avatarSize={variant === "grid" && fit ? Math.round(Math.min(128, Math.max(40, fit.height * 0.42))) : undefined}
        name={p.name}
        avatar={avatars.get(p.identity)?.avatar ?? "rabbit"}
        photo={avatars.get(p.identity)?.photo}
        isLocal={p.isLocal}
        talking={p.isSpeaking}
        muted={p.isMuted}
        deafened={p.isLocal ? voice.deafened : p.isDeafened}
        video={p.cameraTrack}
        volume={p.volume}
        onPerson={(anchor) => openPerson(p.identity, anchor)}
        onActivate={variant !== "main" && p.cameraTrack ? () => focus(t.key) : undefined}
        activateLabel={p.isLocal ? "Ampliar sua câmera" : `Ampliar a câmera de ${p.name}`}
      />
    );
  };

  const watching = others.length;
  const subtitle = !connected
    ? connectionLabel(voice.connection)
    : voice.screenSharing
      ? `Você está compartilhando · ${watching === 0 ? "ninguém assistindo ainda" : `${watching} assistindo`}`
      : people.length === 1
        ? "Só você na sala"
        : `${people.length} na sala`;

  return (
    <>
      <div className="main-h">
        <span className="room-ico big" aria-hidden="true">
          {room && <RoomIcon icon={room.icon} size={20} />}
        </span>
        <div className="grow">
          <h1>{room?.name ?? "…"}</h1>
          <span className="sub">{subtitle}</span>
        </div>
        {voice.screenSharing && (
          <Button
            variant="danger"
            size="sm"
            icon={<ScreenShareOff size={15} aria-hidden="true" />}
            onClick={() => void voice.stopScreenShare()}
          >
            Parar de compartilhar
          </Button>
        )}
        {connected && (
          <Button
            size="sm"
            variant={cinema.session ? "primary" : "secondary"}
            aria-pressed={!!cinema.session}
            icon={<Clapperboard size={15} aria-hidden="true" />}
            onClick={() => setCinemaPick(true)}
            data-tip={cinema.session ? "Trocar o vídeo da sessão" : "Assistir junto: YouTube ou arquivo do PC"}
          >
            Cinema
          </Button>
        )}
        {connected && (
          <Button
            size="sm"
            variant={playing ? "primary" : "secondary"}
            aria-pressed={playing}
            disabled={playing}
            icon={<Gamepad2 size={15} aria-hidden="true" />}
            onClick={() => setGamesOpen(true)}
            data-tip={playing ? "Tem um jogo rolando" : "Jogar com a sala"}
          >
            Jogos
          </Button>
        )}
        {room && (
          <Button size="sm" icon={<Users size={15} aria-hidden="true" />} onClick={onMembers}>
            Membros · {room.members.length}
          </Button>
        )}
        <Button
          size="sm"
          className="with-badge"
          variant={chatOpen ? "primary" : "secondary"}
          aria-pressed={chatOpen}
          icon={<MessageSquare size={15} aria-hidden="true" />}
          onClick={onToggleChat}
        >
          Chat
          {!chatOpen && chatUnread > 0 && (
            <span className="badge count" aria-label={`${chatUnread} não lidas`}>
              {chatUnread > 99 ? "99+" : chatUnread}
            </span>
          )}
        </Button>
      </div>

      {!connected ? (
        <div className="empty">
          <h2>{connectionLabel(voice.connection)}</h2>
        </div>
      ) : draw.game ? (
        <div className="game-layout">
          <DrawGameView draw={draw} people={people} avatars={avatars} onPlayAgain={() => draw.start(lastDrawSettings())} />
        </div>
      ) : duel.session ? (
        <div className="game-layout">
          <DuelView duel={duel} people={people} avatars={avatars} />
        </div>
      ) : cinema.session ? (
        <div className="focus-layout cinema-layout">
          <div className="focus-main">
            <CinemaView
              cinema={cinema}
              hostName={
                cinema.session.host === cinema.me ? "você" : (people.find((p) => p.identity === cinema.session!.host)?.name ?? "alguém")
              }
              onChange={() => setCinemaPick(true)}
            />
          </div>
          <div className="focus-strip" aria-label="Pessoas na sala">
            {tiles.map((t) => renderTile(t, "strip"))}
          </div>
        </div>
      ) : focused ? (
        <div className="focus-layout">
          <div className="focus-main" ref={mainRef} onDoubleClick={toggleFullscreen}>
            {renderTile(focused, "main")}
            <div className="focus-tools">
              <IconButton label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
              </IconButton>
              {!fullscreen && (
                <IconButton label="Voltar à grade (Esc)" onClick={toGrid}>
                  <LayoutGrid size={18} aria-hidden="true" />
                </IconButton>
              )}
            </div>
          </div>
          <div className="focus-strip" aria-label="Outros quadros">
            {tiles.filter((t) => t !== focused).map((t) => renderTile(t, "strip"))}
          </div>
        </div>
      ) : (
        <div
          ref={setGridEl}
          className="stage"
          style={
            fit
              ? { gridTemplateColumns: `repeat(${fit.columns}, ${fit.width}px)`, gridAutoRows: `${fit.height}px` }
              : { visibility: "hidden" }
          }
        >
          {tiles.map((t) => renderTile(t, "grid"))}
        </div>
      )}

      {cinemaPick && (
        <CinemaStartModal
          onClose={() => setCinemaPick(false)}
          onStart={(source, file) => {
            setCinemaPick(false);
            cinema.start(source, file);
          }}
        />
      )}

      {gamesOpen && (
        <GamesModal
          people={people}
          onClose={() => setGamesOpen(false)}
          onStartDraw={(settings) => {
            setGamesOpen(false);
            draw.start(settings);
          }}
          onStartDuel={(kind, players) => {
            setGamesOpen(false);
            duel.start(kind, players);
          }}
        />
      )}

      <CallControls
        connected={connected}
        muted={voice.muted}
        micTrack={voice.micMediaTrack}
        deafened={voice.deafened}
        cameraOn={voice.cameraOn}
        screenSharing={voice.screenSharing}
        onToggleMic={() => void voice.toggleMute()}
        onToggleDeafen={() => void voice.toggleDeafen()}
        onToggleCamera={() => void voice.toggleCamera()}
        onShareScreen={() => (voice.screenSharing ? void voice.stopScreenShare() : onShareScreen())}
        onLeave={() => void voice.leave()}
        ptt={audio.micMode === "ptt" && audio.pttLabel ? { label: audio.pttLabel, held: voice.pttHeld } : null}
      />
    </>
  );
}

/** "Tela da Ana · Planilha" (o nome da janela vem de quem compartilha) */
function screenTitle(p: VoiceParticipant): string {
  const who = p.isLocal ? "Sua tela" : `Tela de ${p.name}`;
  return p.screenName ? `${who} · ${p.screenName}` : who;
}

/** Quadro de uma tela compartilhada */
function ScreenTile({
  p,
  variant,
  onActivate,
  onScreenVolume,
}: {
  p: VoiceParticipant;
  variant: TileVariant;
  onActivate?: () => void;
  /** Volume do som do PC que vem junto com a tela */
  onScreenVolume: (volume: number) => void;
}) {
  const title = screenTitle(p);
  return (
    <div className={`screen ${variant} ${onActivate ? "zoomable" : ""}`} role="group" aria-label={title}>
      {onActivate && <button type="button" className="pc-hit" aria-label={`Ampliar: ${title}`} onClick={onActivate} />}
      <div className="screen-top">
        <span className="live">AO VIVO</span>
        <span className="who">
          {variant === "strip" ? (p.isLocal ? "Sua tela" : p.name) : title}
        </span>
        {!p.isLocal && p.hasScreenAudio && variant !== "strip" && (
          <VolumeControl
            className="screen-vol"
            name={p.name}
            title={`Som da tela de ${p.name}`}
            volume={p.screenVolume}
            max={MAX_VOLUME}
            onChange={onScreenVolume}
          />
        )}
      </div>
      <VideoView key={p.identity} track={p.screenTrack!} className="screen-video" />
    </div>
  );
}
