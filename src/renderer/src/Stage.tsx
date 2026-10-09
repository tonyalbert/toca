import { useEffect, useRef, useState } from "react";
import type { VideoTrack } from "livekit-client";
import { Avatar } from "./Avatar";
import { ExitFullscreenIcon, FullscreenIcon, MicOffIcon } from "./icons";
import type { VoiceParticipant } from "./useVoiceRoom";

/** Um quadro na área principal: a câmera/avatar de alguém ou uma tela compartilhada */
interface StageItem {
  key: string;
  kind: "camera" | "screen";
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  video: VideoTrack | null;
}

function buildItems(participants: VoiceParticipant[]): StageItem[] {
  const screens: StageItem[] = [];
  const cameras: StageItem[] = [];
  for (const p of participants) {
    cameras.push({
      key: `${p.identity}:camera`,
      kind: "camera",
      name: p.isLocal ? `${p.name} (você)` : p.name,
      isLocal: p.isLocal,
      isSpeaking: p.isSpeaking,
      isMuted: p.isMuted,
      video: p.cameraTrack,
    });
    if (p.screenTrack) {
      screens.push({
        key: `${p.identity}:screen`,
        kind: "screen",
        name: p.isLocal ? "Sua tela" : `Tela de ${p.name}`,
        isLocal: p.isLocal,
        isSpeaking: false,
        isMuted: false,
        video: p.screenTrack,
      });
    }
  }
  // Telas compartilhadas aparecem primeiro
  return [...screens, ...cameras];
}

export function Stage({ participants }: { participants: VoiceParticipant[] }) {
  const items = buildItems(participants);
  // Quadro em destaque (clique num vídeo para ampliar/reduzir)
  const [focused, setFocused] = useState<string | null>(null);

  // Quando outra pessoa começa a compartilhar a tela, ela vai para o destaque
  const remoteScreens = items
    .filter((i) => i.kind === "screen" && !i.isLocal)
    .map((i) => i.key)
    .join(",");
  const knownScreens = useRef<string[]>([]);
  useEffect(() => {
    const now = remoteScreens ? remoteScreens.split(",") : [];
    const started = now.find((k) => !knownScreens.current.includes(k));
    if (started) setFocused(started);
    knownScreens.current = now;
  }, [remoteScreens]);

  const toggleFocus = (key: string) => setFocused((f) => (f === key ? null : key));
  const focusedItem = items.find((i) => i.key === focused && i.video);

  if (focusedItem) {
    // Vídeo ampliado ocupando a área, os demais numa faixa embaixo
    return (
      <div className="focus-layout">
        <div className="focus-main">
          <StageTile item={focusedItem} focused onToggleFocus={() => toggleFocus(focusedItem.key)} />
        </div>
        <div className="focus-strip">
          {items
            .filter((i) => i !== focusedItem)
            .map((i) => (
              <StageTile key={i.key} item={i} focused={false} onToggleFocus={() => toggleFocus(i.key)} />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tiles">
      {items.map((i) => (
        <StageTile key={i.key} item={i} focused={false} onToggleFocus={() => toggleFocus(i.key)} />
      ))}
    </div>
  );
}

function StageTile({
  item,
  focused,
  onToggleFocus,
}: {
  item: StageItem;
  focused: boolean;
  onToggleFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen();
  };

  const isScreen = item.kind === "screen";
  const classes = [
    "tile",
    isScreen && "screen",
    item.isSpeaking && "speaking",
    item.video && "has-video",
    focused && "focused",
  ];

  return (
    <div
      ref={ref}
      className={classes.filter(Boolean).join(" ")}
      onClick={item.video && !fullscreen ? onToggleFocus : undefined}
      onDoubleClick={isScreen ? toggleFullscreen : undefined}
      title={item.video && !fullscreen ? (focused ? "Clique para reduzir" : "Clique para ampliar") : undefined}
    >
      {item.video ? (
        // A própria câmera aparece espelhada, como num espelho (os outros te veem normal)
        <VideoView track={item.video} mirror={item.isLocal && !isScreen} />
      ) : (
        <Avatar name={item.name} size={72} />
      )}
      <div className="tile-name">
        {item.isMuted && <MicOffIcon />}
        {item.name}
      </div>
      {isScreen && (
        <button
          className="tile-fullscreen"
          onClick={toggleFullscreen}
          title={fullscreen ? "Sair da tela cheia (Esc)" : "Tela cheia"}
        >
          {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      )}
    </div>
  );
}

function VideoView({ track, mirror }: { track: VideoTrack; mirror: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return <video ref={ref} className={`tile-video ${mirror ? "mirror" : ""}`} autoPlay playsInline muted />;
}
