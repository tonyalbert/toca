import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  LocalAudioTrack,
  Participant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type VideoTrack,
} from "livekit-client";
import { fetchToken } from "./api";
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
  /** Vídeo da câmera, se estiver ligada (e, para os outros, já recebida) */
  cameraTrack: VideoTrack | null;
}

export interface VoiceState {
  /** Slug da sala em que estamos (ou tentando entrar) */
  room: string | null;
  connection: ConnectionState;
  participants: VoiceParticipant[];
  muted: boolean;
  cameraOn: boolean;
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
  micMediaTrack: null,
  error: null,
};

function toVoiceParticipant(p: Participant, isLocal: boolean): VoiceParticipant {
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    isMuted: !p.isMicrophoneEnabled,
    cameraTrack: cameraTrackOf(p),
  };
}

function cameraTrackOf(p: Participant): VideoTrack | null {
  const pub = p.getTrackPublication(Track.Source.Camera);
  if (!pub || pub.isMuted) return null;
  return pub.videoTrack ?? null;
}

function localMicTrack(room: Room): MediaStreamTrack | null {
  const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  return track instanceof LocalAudioTrack ? track.mediaStreamTrack : null;
}

function snapshot(room: Room): VoiceParticipant[] {
  return [
    toVoiceParticipant(room.localParticipant, true),
    ...[...room.remoteParticipants.values()]
      .map((p) => toVoiceParticipant(p, false))
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
  // Identidades que este app já usou nesta sessão. A API pode demorar alguns
  // segundos para refletir uma saída, então isso permite esconder "ecos" nossos
  // em salas de onde já saímos.
  const ownIdentities = useRef(new Set<string>());
  // Elementos <audio> dos participantes remotos
  const audioContainer = useRef<HTMLDivElement | null>(null);

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
    if (room) await room.disconnect();
    setState((s) => ({ ...initialState, error: s.error }));
  }, []);

  const join = useCallback(
    async (name: string, slug: string) => {
      if (roomRef.current) await leave();

      setState({ ...initialState, room: slug, connection: ConnectionState.Connecting });

      const room = new Room({
        // Recebe o vídeo dos outros na resolução do quadro em que ele aparece
        adaptiveStream: true,
        // Para de enviar camadas de vídeo que ninguém está assistindo
        dynacast: true,
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
          participants: snapshot(room),
          muted: !room.localParticipant.isMicrophoneEnabled,
          cameraOn: room.localParticipant.isCameraEnabled,
          micMediaTrack: localMicTrack(room),
        }));
      };

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            audioContainer.current?.appendChild(track.attach());
          }
          sync();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
          sync();
        })
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.ParticipantNameChanged, sync)
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.TrackMuted, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.TrackPublished, sync)
        .on(RoomEvent.TrackUnpublished, sync)
        .on(RoomEvent.LocalTrackPublished, sync)
        .on(RoomEvent.LocalTrackUnpublished, sync)
        .on(RoomEvent.ConnectionStateChanged, sync)
        .on(RoomEvent.ActiveDeviceChanged, sync)
        .on(RoomEvent.Disconnected, () => {
          // Desconexão iniciada pelo servidor ou queda de rede definitiva
          if (roomRef.current === room) {
            roomRef.current = null;
            setState({ ...initialState, error: "Você foi desconectado da sala." });
          }
        });

      try {
        const { token, url, identity } = await fetchToken(name, slug);
        ownIdentities.current.add(identity);
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
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        // Conectado, mas sem microfone (sem permissão ou sem dispositivo)
        setState((s) => ({ ...s, error: `Microfone indisponível: ${(err as Error).message}` }));
      }
      sync();
    },
    [leave],
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const lp = room.localParticipant;
    try {
      await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
      setState((s) => ({ ...s, error: null }));
    } catch (err) {
      setState((s) => ({ ...s, error: `Microfone indisponível: ${(err as Error).message}` }));
    }
    setState((s) => ({
      ...s,
      muted: !lp.isMicrophoneEnabled,
      participants: snapshot(room),
      micMediaTrack: localMicTrack(room),
    }));
  }, []);

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
    setState((s) => ({ ...s, cameraOn: lp.isCameraEnabled, participants: snapshot(room) }));
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
    setState((s) => ({ ...s, participants: snapshot(room) }));
  }, []);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  // Sai da sala ao fechar a janela
  useEffect(() => {
    const onUnload = () => void roomRef.current?.disconnect();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void roomRef.current?.disconnect();
    };
  }, []);

  const isOwnIdentity = useCallback((identity: string) => ownIdentities.current.has(identity), []);

  return {
    ...state,
    micDeviceId,
    cameraDeviceId,
    join,
    leave,
    toggleMute,
    toggleCamera,
    setMicDevice,
    setCameraDevice,
    clearError,
    isOwnIdentity,
  };
}
