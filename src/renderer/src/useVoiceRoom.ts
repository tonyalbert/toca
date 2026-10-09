import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  DisconnectReason,
  LocalAudioTrack,
  Participant,
  RemoteTrack,
  Room,
  AudioPresets,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type VideoTrack,
} from "livekit-client";
import { fetchRoomToken } from "./api";
import { startScreenAudio, type ScreenAudio } from "./screenAudio";
import {
  DEFAULT_DEVICE,
  availableDeviceId,
  captureDeviceId,
  listDevices,
  loadDeviceId,
  saveDeviceId,
} from "./devices";

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  /** Fone desligado (não está ouvindo a sala) */
  isDeafened: boolean;
  /** Volume com que ouvimos essa pessoa (1 = 100%; vai até 2). Só neste PC. */
  volume: number;
  /** Vídeo da câmera, se estiver ligada (e, para os outros, já recebida) */
  cameraTrack: VideoTrack | null;
  /** Tela compartilhada, se estiver compartilhando */
  screenTrack: VideoTrack | null;
  /** O que está sendo compartilhado (nome da janela ou da tela) */
  screenName: string | null;
  /** A tela vai com o som do computador */
  hasScreenAudio: boolean;
  /** Volume do som da tela dessa pessoa (1 = 100%) */
  screenVolume: number;
}

export interface VoiceState {
  /** Slug da sala em que estamos (ou tentando entrar) */
  room: string | null;
  connection: ConnectionState;
  participants: VoiceParticipant[];
  muted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  /** Áudio do nosso microfone, para medir o volume localmente. Muda ao trocar de microfone. */
  micMediaTrack: MediaStreamTrack | null;
  error: string | null;
}

const initialState: VoiceState = {
  room: null,
  connection: ConnectionState.Disconnected,
  participants: [],
  muted: false,
  cameraOn: false,
  screenSharing: false,
  micMediaTrack: null,
  error: null,
};

// Atributo do LiveKit em que cada app publica se está com o fone desligado
const DEAFENED_ATTR = "deafened";

/** Conta aos outros da sala se estamos com o fone desligado */
function publishDeafened(room: Room | null, value: boolean) {
  if (room?.state !== ConnectionState.Connected) return;
  room.localParticipant.setAttributes({ [DEAFENED_ATTR]: value ? "1" : "0" }).catch(() => {
    // Sem permissão no ingresso (API antiga): só os outros não veem o fone desligado
  });
}

// Volume de cada pessoa (pelo id do usuário), lembrado entre as chamadas
const VOLUMES_KEY = "toca.volumes";
export const MAX_VOLUME = 2;

/** O som da tela de cada pessoa tem volume próprio, separado da voz */
const screenKey = (identity: string) => `tela:${identity}`;

function loadVolumes(): Map<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUMES_KEY) ?? "{}") as Record<string, number>;
    return new Map(Object.entries(saved).filter(([, v]) => typeof v === "number" && v >= 0 && v <= MAX_VOLUME));
  } catch {
    return new Map();
  }
}

function saveVolumes(volumes: Map<string, number>) {
  try {
    localStorage.setItem(VOLUMES_KEY, JSON.stringify(Object.fromEntries(volumes)));
  } catch {
    // sem armazenamento: vale só até fechar o app
  }
}

function toVoiceParticipant(p: Participant, isLocal: boolean, volumes: Map<string, number>): VoiceParticipant {
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    isMuted: !p.isMicrophoneEnabled,
    isDeafened: p.attributes[DEAFENED_ATTR] === "1",
    volume: isLocal ? 1 : (volumes.get(p.identity) ?? 1),
    screenName: p.getTrackPublication(Track.Source.ScreenShare)?.trackName || null,
    hasScreenAudio: !!p.getTrackPublication(Track.Source.ScreenShareAudio),
    screenVolume: isLocal ? 1 : (volumes.get(screenKey(p.identity)) ?? 1),
    cameraTrack: videoTrackOf(p, Track.Source.Camera),
    screenTrack: videoTrackOf(p, Track.Source.ScreenShare),
  };
}

function videoTrackOf(p: Participant, source: Track.Source): VideoTrack | null {
  const pub = p.getTrackPublication(source);
  if (!pub || pub.isMuted) return null;
  return pub.videoTrack ?? null;
}

function disconnectMessage(reason?: DisconnectReason): string {
  switch (reason) {
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "Você foi removido da sala.";
    case DisconnectReason.ROOM_DELETED:
      return "A sala foi encerrada.";
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "Você entrou nesta sala em outro computador.";
    default:
      return "Você foi desconectado da sala.";
  }
}

function localMicTrack(room: Room): MediaStreamTrack | null {
  const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  return track instanceof LocalAudioTrack ? track.mediaStreamTrack : null;
}

function snapshot(room: Room, volumes: Map<string, number>): VoiceParticipant[] {
  return [
    toVoiceParticipant(room.localParticipant, true, volumes),
    ...[...room.remoteParticipants.values()]
      .map((p) => toVoiceParticipant(p, false, volumes))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export function useVoiceRoom() {
  const [state, setState] = useState<VoiceState>(initialState);
  const [micDeviceId, setMicDeviceIdState] = useState(() => loadDeviceId("audioinput"));
  const micDeviceRef = useRef(micDeviceId);
  const [cameraDeviceId, setCameraDeviceIdState] = useState(() => loadDeviceId("videoinput"));
  const cameraDeviceRef = useRef(cameraDeviceId);
  const roomRef = useRef<Room | null>(null);
  // Áudio do computador publicado junto com a tela (sem o som do próprio Toca)
  const screenAudioRef = useRef<ScreenAudio | null>(null);

  const stopScreenAudio = async (room: Room | null) => {
    const audio = screenAudioRef.current;
    screenAudioRef.current = null;
    if (!audio) return;
    if (room && room.state === ConnectionState.Connected) {
      await room.localParticipant.unpublishTrack(audio.track).catch(() => {});
    }
    audio.stop();
  };
  // Elementos <audio> dos participantes remotos
  const audioContainer = useRef<HTMLDivElement | null>(null);

  // Fone mutado: não toca o áudio de ninguém e o microfone fica desligado.
  // Vale entre salas (como uma preferência) até a pessoa desmutar.
  const [deafened, setDeafened] = useState(false);
  const deafenedRef = useRef(false);
  // O microfone estava ligado quando mutou o fone? Ao desmutar, volta como estava.
  const micOnBeforeDeafen = useRef(true);

  const volumesRef = useRef(loadVolumes());

  /** Volume de cada pessoa da sala; com o fone desligado, tudo em 0 */
  const applyVolumes = (room: Room | null) => {
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      const off = deafenedRef.current;
      p.setVolume(off ? 0 : (volumesRef.current.get(p.identity) ?? 1), Track.Source.Microphone);
      p.setVolume(off ? 0 : (volumesRef.current.get(screenKey(p.identity)) ?? 1), Track.Source.ScreenShareAudio);
    }
  };

  const applyDeafen = (value: boolean) => {
    deafenedRef.current = value;
    setDeafened(value);
    applyVolumes(roomRef.current);
    publishDeafened(roomRef.current, value);
  };

  useEffect(() => {
    const div = document.createElement("div");
    div.style.display = "none";
    document.body.appendChild(div);
    audioContainer.current = div;
    return () => div.remove();
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    await stopScreenAudio(null);
    if (room) await room.disconnect();
    setState((s) => ({ ...initialState, error: s.error }));
  }, []);

  const join = useCallback(
    async (roomId: string) => {
      if (roomRef.current) await leave();

      setState({ ...initialState, room: roomId, connection: ConnectionState.Connecting });

      const room = new Room({
        // Recebe o vídeo dos outros na resolução do quadro em que ele aparece
        adaptiveStream: true,
        // Para de enviar camadas de vídeo que ninguém está assistindo
        dynacast: true,
        // Áudio pelo Web Audio: permite volume por pessoa acima de 100%
        webAudioMix: true,
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
        audioCaptureDefaults: {
          deviceId: captureDeviceId(await availableDeviceId("audioinput", micDeviceRef.current)),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      const sync = () => {
        if (roomRef.current !== room) return;
        setState((s) => ({
          ...s,
          connection: room.state,
          participants: snapshot(room, volumesRef.current),
          muted: !room.localParticipant.isMicrophoneEnabled,
          cameraOn: room.localParticipant.isCameraEnabled,
          screenSharing: room.localParticipant.isScreenShareEnabled,
          micMediaTrack: localMicTrack(room),
        }));
      };

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            audioContainer.current?.appendChild(track.attach());
            applyVolumes(room);
          }
          sync();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
          sync();
        })
        .on(RoomEvent.ParticipantConnected, () => {
          applyVolumes(room);
          sync();
        })
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.ParticipantNameChanged, sync)
        .on(RoomEvent.ParticipantAttributesChanged, sync)
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.TrackMuted, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.TrackPublished, sync)
        .on(RoomEvent.TrackUnpublished, sync)
        .on(RoomEvent.LocalTrackPublished, sync)
        .on(RoomEvent.LocalTrackUnpublished, (pub) => {
          // Tela parou (pelo botão ou pelo sistema): o áudio dela para junto
          if (pub.source === Track.Source.ScreenShare) void stopScreenAudio(room);
          sync();
        })
        .on(RoomEvent.ConnectionStateChanged, sync)
        .on(RoomEvent.ActiveDeviceChanged, sync)
        .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          // Desconexão iniciada pelo servidor ou queda de rede definitiva
          if (roomRef.current === room) {
            roomRef.current = null;
            void stopScreenAudio(null);
            setState({ ...initialState, error: disconnectMessage(reason) });
          }
        });

      try {
        const { token, url } = await fetchRoomToken(roomId);
        if (roomRef.current !== room) return; // usuário saiu/trocou de sala no meio
        await room.connect(url, token);
      } catch (err) {
        if (roomRef.current === room) {
          roomRef.current = null;
          await room.disconnect();
          setState({ ...initialState, error: `Não foi possível entrar: ${(err as Error).message}` });
        }
        return;
      }

      try {
        // Com o fone mutado, entra com o microfone desligado (liga ao desmutar)
        if (deafenedRef.current) {
          micOnBeforeDeafen.current = true;
          publishDeafened(room, true);
        }
        else await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        // Conectado, mas sem microfone (sem permissão ou sem dispositivo)
        setState((s) => ({ ...s, error: `Microfone indisponível: ${(err as Error).message}` }));
      }
      sync();
    },
    [leave],
  );

  const setMic = async (room: Room, enabled: boolean) => {
    const lp = room.localParticipant;
    try {
      await lp.setMicrophoneEnabled(enabled);
      setState((s) => ({ ...s, error: null }));
    } catch (err) {
      setState((s) => ({ ...s, error: `Microfone indisponível: ${(err as Error).message}` }));
    }
    setState((s) => ({
      ...s,
      muted: !lp.isMicrophoneEnabled,
      participants: snapshot(room, volumesRef.current),
      micMediaTrack: localMicTrack(room),
    }));
  };

  const toggleDeafen = useCallback(async () => {
    const room = roomRef.current;
    const connected = room?.state === ConnectionState.Connected;
    if (!deafenedRef.current) {
      micOnBeforeDeafen.current = connected ? room!.localParticipant.isMicrophoneEnabled : true;
      applyDeafen(true);
      if (connected && room!.localParticipant.isMicrophoneEnabled) await setMic(room!, false);
    } else {
      applyDeafen(false);
      if (connected && micOnBeforeDeafen.current) await setMic(room!, true);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const lp = room.localParticipant;
    // Desmutar o microfone com o fone mutado desmuta os dois
    if (deafenedRef.current && !lp.isMicrophoneEnabled) {
      micOnBeforeDeafen.current = true;
      return toggleDeafen();
    }
    try {
      await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
      setState((s) => ({ ...s, error: null }));
    } catch (err) {
      setState((s) => ({ ...s, error: `Microfone indisponível: ${(err as Error).message}` }));
    }
    setState((s) => ({
      ...s,
      muted: !lp.isMicrophoneEnabled,
      participants: snapshot(room, volumesRef.current),
      micMediaTrack: localMicTrack(room),
    }));
  }, [toggleDeafen]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const lp = room.localParticipant;
    try {
      await lp.setCameraEnabled(
        !lp.isCameraEnabled,
        // Ao ligar, usa a câmera escolhida nas configurações
        lp.isCameraEnabled
          ? undefined
          : {
              deviceId: captureDeviceId(await availableDeviceId("videoinput", cameraDeviceRef.current)),
              resolution: VideoPresets.h720.resolution,
            },
      );
    } catch (err) {
      const e = err as Error;
      const hint = e.name === "NotReadableError" ? " (outro programa pode estar usando a câmera)" : "";
      setState((s) => ({ ...s, error: `Câmera indisponível: ${e.message}${hint}` }));
    }
    setState((s) => ({ ...s, cameraOn: lp.isCameraEnabled, participants: snapshot(room, volumesRef.current) }));
  }, []);

  /**
   * Compartilha a tela/janela escolhida no seletor. O processo principal entrega
   * essa fonte quando o LiveKit chama getDisplayMedia.
   */
  const startScreenShare = useCallback(async (sourceId: string, withAudio: boolean, sourceName?: string) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const lp = room.localParticipant;
    try {
      if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
      await window.toca.selectScreenSource(sourceId);
      // Só o vídeo vem do getDisplayMedia; o áudio vem do startScreenAudio abaixo
      await lp.setScreenShareEnabled(
        true,
        { audio: false, resolution: ScreenSharePresets.h1080fps30.resolution, contentHint: "detail" },
        { screenShareEncoding: ScreenSharePresets.h1080fps30.encoding, name: sourceName?.slice(0, 80) },
      );
    } catch (err) {
      setState((s) => ({ ...s, error: `Não foi possível compartilhar a tela: ${(err as Error).message}` }));
    }

    if (withAudio && lp.isScreenShareEnabled) {
      try {
        const audio = await startScreenAudio();
        screenAudioRef.current = audio;
        await lp.publishTrack(audio.track, {
          source: Track.Source.ScreenShareAudio,
          name: "screen_share_audio",
          // Configurações para música/jogo, não para voz
          audioPreset: AudioPresets.musicHighQualityStereo,
          forceStereo: true,
          dtx: false,
          red: false,
        });
      } catch (err) {
        await stopScreenAudio(room);
        setState((s) => ({
          ...s,
          error: `Compartilhando a tela sem áudio: ${(err as Error).message}`,
        }));
      }
    }
    setState((s) => ({ ...s, screenSharing: lp.isScreenShareEnabled, participants: snapshot(room, volumesRef.current) }));
  }, []);

  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await stopScreenAudio(room);
    await room.localParticipant.setScreenShareEnabled(false);
    setState((s) => ({ ...s, screenSharing: false, participants: snapshot(room, volumesRef.current) }));
  }, []);

  /** Troca o microfone; se estiver numa sala, a troca acontece na hora */
  const setMicDevice = useCallback(async (deviceId: string) => {
    micDeviceRef.current = deviceId;
    setMicDeviceIdState(deviceId);
    saveDeviceId("audioinput", deviceId);

    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    try {
      await room.switchActiveDevice("audioinput", deviceId);
    } catch (err) {
      setState((s) => ({ ...s, error: `Não foi possível trocar o microfone: ${(err as Error).message}` }));
    }
    setState((s) => ({ ...s, micMediaTrack: localMicTrack(room) }));
  }, []);

  /** Troca a câmera; se ela estiver ligada numa sala, a troca acontece na hora */
  const setCameraDevice = useCallback(async (deviceId: string) => {
    cameraDeviceRef.current = deviceId;
    setCameraDeviceIdState(deviceId);
    saveDeviceId("videoinput", deviceId);

    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected || !room.localParticipant.isCameraEnabled) return;
    try {
      // "Automática" não é um dispositivo real: usa a primeira câmera da lista
      const target =
        deviceId === DEFAULT_DEVICE
          ? (await listDevices("videoinput")).find((d) => d.deviceId !== DEFAULT_DEVICE)?.deviceId
          : deviceId;
      if (target) await room.switchActiveDevice("videoinput", target);
    } catch (err) {
      setState((s) => ({ ...s, error: `Não foi possível trocar a câmera: ${(err as Error).message}` }));
    }
    setState((s) => ({ ...s, participants: snapshot(room, volumesRef.current) }));
  }, []);

  /**
   * Volume de uma pessoa (0 a 2), lembrado neste PC para as próximas chamadas.
   * what = "screen" muda só o som da tela que ela compartilha.
   */
  const setParticipantVolume = useCallback((identity: string, volume: number, what: "voice" | "screen" = "voice") => {
    const v = Math.max(0, Math.min(MAX_VOLUME, volume));
    const key = what === "screen" ? screenKey(identity) : identity;
    if (v === 1) volumesRef.current.delete(key);
    else volumesRef.current.set(key, v);
    saveVolumes(volumesRef.current);
    const room = roomRef.current;
    applyVolumes(room);
    if (room) setState((s) => ({ ...s, participants: snapshot(room, volumesRef.current) }));
  }, []);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);
  const showError = useCallback((error: string) => setState((s) => ({ ...s, error })), []);

  // Sai da sala ao fechar a janela
  useEffect(() => {
    const onUnload = () => void roomRef.current?.disconnect();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void roomRef.current?.disconnect();
    };
  }, []);

  return {
    ...state,
    micDeviceId,
    cameraDeviceId,
    join,
    leave,
    toggleMute,
    deafened,
    toggleDeafen,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    setMicDevice,
    setCameraDevice,
    setParticipantVolume,
    clearError,
    showError,
  };
}

/** O que useVoiceRoom devolve (estado da chamada + ações) */
export type VoiceRoom = ReturnType<typeof useVoiceRoom>;
