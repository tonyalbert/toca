import { useEffect, useRef, useState } from "react";
import { CircleAlert, Clapperboard, FileVideo, Maximize, Minimize, Pause, Play, Repeat, Square, Volume2, VolumeX } from "lucide-react";
import { expectedPos, parseYouTube, type Cinema, type CinemaSource } from "./cinema";
import { Button, IconButton } from "./components/Button";
import { Input } from "./components/Input";
import { Modal } from "./components/Modal";

// ---------- players ----------

/** O que a tela precisa de um player (YouTube ou <video>) */
interface Driver {
  time(): number;
  duration(): number;
  /** Tocando ou carregando para tocar */
  playing(): boolean;
  play(): void;
  pause(): void;
  seek(t: number): void;
  setVolume(v: number): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let youTubeApi: Promise<any> | null = null;

/** Carrega a API de player do YouTube uma vez só */
function loadYouTube(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  youTubeApi ??= new Promise((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      youTubeApi = null;
      reject(new Error("Não deu para carregar o YouTube. Confira a internet."));
    };
    document.head.appendChild(script);
  });
  return youTubeApi;
}

const YT_ERRORS: Record<number, string> = {
  2: "Link do YouTube inválido.",
  5: "O YouTube não conseguiu tocar este vídeo aqui.",
  100: "Vídeo não encontrado (removido ou privado).",
  101: "O dono do vídeo não deixa ele tocar fora do YouTube.",
  150: "O dono do vídeo não deixa ele tocar fora do YouTube.",
  153: "O YouTube recusou o player. Atualize o Toca.",
};

function YouTubePlayer({ videoId, onDriver, onError }: { videoId: string; onDriver: (d: Driver | null) => void; onError: (msg: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let player: any = null;
    let cancelled = false;
    const el = document.createElement("div");
    hostRef.current?.appendChild(el);
    loadYouTube()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(el, {
          videoId,
          width: "100%",
          height: "100%",
          // Sem os controles do YouTube: tudo passa pelos controles da sala
          playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: () => {
              if (cancelled) return;
              onDriver({
                time: () => player.getCurrentTime?.() ?? 0,
                duration: () => player.getDuration?.() ?? 0,
                playing: () => [1, 3].includes(player.getPlayerState?.()),
                play: () => player.playVideo(),
                pause: () => player.pauseVideo(),
                seek: (t) => player.seekTo(t, true),
                setVolume: (v) => {
                  player.setVolume(Math.round(v * 100));
                  if (v > 0) player.unMute();
                },
              });
            },
            onError: (e: { data: number }) => onError(YT_ERRORS[e.data] ?? `O YouTube deu erro (${e.data}).`),
          },
        });
      })
      .catch((err: Error) => onError(err.message));
    return () => {
      cancelled = true;
      onDriver(null);
      player?.destroy?.();
      el.remove();
    };
  }, [videoId]);
  return <div className="cine-yt" ref={hostRef} />;
}

function FilePlayer({ url, onDriver, onError, onNoAudio }: { url: string; onDriver: (d: Driver | null) => void; onError: (msg: string) => void; onNoAudio: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const ready = () =>
      onDriver({
        time: () => v.currentTime,
        duration: () => (Number.isFinite(v.duration) ? v.duration : 0),
        playing: () => !v.paused && !v.ended,
        play: () => void v.play().catch(() => {}),
        pause: () => v.pause(),
        seek: (t) => {
          v.currentTime = t;
        },
        setVolume: (vol) => {
          v.volume = Math.min(1, Math.max(0, vol));
        },
      });
    v.addEventListener("loadedmetadata", ready);
    const fail = () => onError("Este arquivo não abre no Toca (formato não suportado). MP4 ou MKV com H.264 funcionam sempre.");
    v.addEventListener("error", fail);
    // Áudio AC3/DTS não toca no Chromium: o vídeo anda sem som
    const audioCheck = setInterval(() => {
      const decoded = (v as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
      if (!v.paused && v.currentTime > 3 && decoded === 0) {
        onNoAudio();
        clearInterval(audioCheck);
      }
    }, 2000);
    return () => {
      v.removeEventListener("loadedmetadata", ready);
      v.removeEventListener("error", fail);
      clearInterval(audioCheck);
      onDriver(null);
    };
  }, [url]);
  return <video ref={ref} className="cine-video" src={url} playsInline preload="auto" />;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- tela ----------

const VOLUME_KEY = "toca.cinema.volume";
const loadVolume = () => {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && v >= 0 && v <= 1 ? v : 0.8;
  } catch {
    return 0.8;
  }
};

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/** O player da sala, com os controles que valem para todo mundo */
export function CinemaView({ cinema, hostName, onChange }: { cinema: Cinema; hostName: string; onChange: () => void }) {
  const session = cinema.session!;
  const [driver, setDriver] = useState<Driver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noAudio, setNoAudio] = useState(false);
  const [volume, setVolume] = useState(loadVolume);
  const [, setTick] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const driverRef = useRef(driver);
  driverRef.current = driver;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Vídeo novo: limpa os avisos
  useEffect(() => {
    setError(null);
    setNoAudio(false);
  }, [session.id]);

  // O hook usa a posição real para mandar aos outros
  useEffect(() => {
    cinema.playerTime.current = () => driverRef.current?.time() ?? null;
    return () => {
      cinema.playerTime.current = () => null;
    };
  }, []);

  useEffect(() => {
    driver?.setVolume(volume);
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // só nesta sessão
    }
  }, [driver, volume]);

  /** Deixa o player igual ao estado da sala (tolerância maior tocando, para não ficar pulando) */
  const align = (tolerance: number) => {
    const d = driverRef.current;
    const s = sessionRef.current;
    if (!d || !s) return;
    const want = expectedPos(s);
    const duration = d.duration();
    // Pausado, todo mundo fica exatamente no mesmo quadro
    const tol = s.playing ? tolerance : Math.min(tolerance, 0.2);
    if (Math.abs(d.time() - want) > tol && (!duration || want < duration - 0.5)) d.seek(want);
    if (s.playing && !d.playing()) d.play();
    if (!s.playing && d.playing()) d.pause();
  };

  // Comando novo (ou o player acabou de abrir): alinha na hora
  useEffect(() => align(0.6), [driver, session.id, session.rev, session.at, session.playing]);
  // De vez em quando confere se não ficou para trás (e atualiza o relógio na tela)
  useEffect(() => {
    const timer = setInterval(() => {
      align(1.5);
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const source = session.source;
  const duration = driver?.duration() || (source.kind === "file" ? source.duration : 0);
  const position = drag ?? (driver ? driver.time() : expectedPos(session));
  const title = source.kind === "file" ? source.name : "YouTube";
  const needsFile = source.kind === "file" && !cinema.file;
  const otherFile = source.kind === "file" && cinema.file && cinema.file.file.size !== source.size;

  const commitSeek = () => {
    if (drag === null) return;
    cinema.control({ pos: drag });
    setDrag(null);
  };

  return (
    <div className={`cine ${fullscreen ? "full" : ""}`} ref={boxRef}>
      <div className="cine-stage">
        {source.kind === "youtube" ? (
          <YouTubePlayer key={session.id} videoId={source.videoId} onDriver={setDriver} onError={setError} />
        ) : cinema.file ? (
          <FilePlayer key={cinema.file.url} url={cinema.file.url} onDriver={setDriver} onError={setError} onNoAudio={() => setNoAudio(true)} />
        ) : null}

        {/* Clique no vídeo: play/pausa para todos (e não deixa mexer direto no player do YouTube) */}
        {!needsFile && !error && (
          <button type="button" className="cine-hit" aria-label={session.playing ? "Pausar para todos" : "Tocar para todos"} onClick={() => cinema.control({ playing: !session.playing })} onDoubleClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void boxRef.current?.requestFullscreen())} />
        )}

        {needsFile && (
          <div className="cine-msg">
            <FileVideo size={32} aria-hidden="true" />
            <strong>{hostName} está passando um arquivo do PC</strong>
            <span className="sm muted">
              Para assistir junto, abra a sua cópia: <b>{source.name}</b> ({sizeLabel(source.size)})
            </span>
            <Button variant="primary" icon={<FileVideo size={16} aria-hidden="true" />} onClick={() => fileRef.current?.click()}>
              Abrir o arquivo
            </Button>
          </div>
        )}
        {error && (
          <div className="cine-msg">
            <CircleAlert size={30} aria-hidden="true" />
            <strong>{error}</strong>
            <Button onClick={onChange}>Escolher outro vídeo</Button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mkv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) cinema.openFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {(otherFile || noAudio) && (
        <p className="cine-warn xs" role="status">
          <CircleAlert size={13} aria-hidden="true" />
          {noAudio
            ? "Este arquivo está sem som aqui: o áudio dele (AC3/DTS) não toca no Toca. Uma versão com áudio AAC resolve."
            : "Seu arquivo tem tamanho diferente do da sala: pode ser outra versão e ficar fora de sincronia."}
        </p>
      )}

      <div className="cine-bar">
        <IconButton label={session.playing ? "Pausar para todos" : "Tocar para todos"} solid disabled={needsFile} onClick={() => cinema.control({ playing: !session.playing })}>
          {session.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </IconButton>
        <span className="cine-time num">{clock(position)}</span>
        <input
          className="cine-seek"
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.min(position, duration || position)}
          aria-label="Posição do vídeo (vale para todos)"
          disabled={!duration || needsFile}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
        />
        <span className="cine-time num">{duration ? clock(duration) : "--:--"}</span>
        <IconButton label={volume === 0 ? "Ligar o som do vídeo" : "Tirar o som do vídeo (só para você)"} onClick={() => setVolume((v) => (v === 0 ? 0.8 : 0))}>
          {volume === 0 ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </IconButton>
        <input
          className="cine-vol"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label="Volume do vídeo (só para você)"
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <span className="cine-title xs muted" title={title}>
          {title} · sessão de {hostName}
        </span>
        <IconButton label="Trocar o vídeo" onClick={onChange}>
          <Repeat size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void boxRef.current?.requestFullscreen())}>
          {fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
        </IconButton>
        <IconButton label="Encerrar a sessão para todos" className="cine-end" onClick={cinema.end}>
          <Square size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

/** Escolher o que a sala vai assistir */
export function CinemaStartModal({ onStart, onClose }: { onStart: (source: CinemaSource, file?: File) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"youtube" | "file">("youtube");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const startYouTube = (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = parseYouTube(link);
    if (!videoId) {
      setError("Isso não parece um link do YouTube.");
      return;
    }
    onStart({ kind: "youtube", videoId });
  };

  /** Lê a duração antes de começar (e já descobre se o formato abre) */
  const startFile = (file: File) => {
    setBusy(true);
    setError(null);
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      setBusy(false);
      onStart({ kind: "file", name: file.name, size: file.size, duration: Number.isFinite(probe.duration) ? probe.duration : 0 }, file);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setBusy(false);
      setError("Este arquivo não abre no Toca (formato não suportado). MP4 ou MKV com H.264 funcionam sempre.");
    };
    probe.src = url;
  };

  return (
    <Modal
      title="Sessão de cinema"
      description="Todo mundo da chamada assiste junto: play, pausa e pulos valem para todos."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {tab === "youtube" ? (
            <Button variant="primary" type="submit" form="cine-yt" disabled={!link.trim()}>
              Começar
            </Button>
          ) : (
            <Button variant="primary" icon={<FileVideo size={16} aria-hidden="true" />} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Abrindo…" : "Escolher arquivo"}
            </Button>
          )}
        </>
      }
    >
      <div className="tabs" role="tablist" aria-label="De onde vem o vídeo" style={{ alignSelf: "flex-start" }}>
        <button role="tab" aria-selected={tab === "youtube"} onClick={() => (setTab("youtube"), setError(null))}>
          YouTube
        </button>
        <button role="tab" aria-selected={tab === "file"} onClick={() => (setTab("file"), setError(null))}>
          Arquivo do PC
        </button>
      </div>
      {tab === "youtube" ? (
        <form id="cine-yt" onSubmit={startYouTube}>
          <Input
            label="Link do vídeo"
            placeholder="https://www.youtube.com/watch?v=…"
            spellCheck={false}
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
            }}
          />
        </form>
      ) : (
        <p className="sm muted">
          Cada pessoa abre a própria cópia do arquivo no PC dela: o vídeo não passa pela internet, então fica com a qualidade
          máxima para todos. O Toca só mantém todo mundo no mesmo ponto.
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="video/*,.mkv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) startFile(f);
          e.target.value = "";
        }}
      />
    </Modal>
  );
}

export const CinemaIcon = Clapperboard;
