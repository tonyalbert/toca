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
  Track,
  VideoPresets,
  type VideoTrack,
} from "livekit-client";
import { fetchRoomToken } from "./api";
import { getAudioSettings, onAudioSettings } from "./audioSettings";
import { MicProcessor } from "./micProcessor";
import { browserNoiseSuppression } from "./noise";
import { getNotifyPrefs } from "./notifyPrefs";
import { playCue } from "./sounds";
import { useSpeaking } from "./useSpeaking";
import { startScreenAudio, type ScreenAudio } from "./screenAudio";
import { screenShareOptions, type ScreenQuality } from "./screenQuality";
import {
  DEFAULT_DEVICE,
  availableDeviceId,
  captureDeviceId,
  listDevices,
  loadDeviceId,
  saveDeviceId,
} from "./devices";
import { features, native } from "./platform";

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
  /** Áudio do microfone (o seu já processado), para medir quem fala no próprio app */
  audioTrack: MediaStreamTrack | null;
  /** Sessão de cinema que essa pessoa está conduzindo (JSON do cinema.ts), se houver */
  cinema: string | null;
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
// Atributo com a sessão de cinema de quem a conduz (para quem entra no meio)
const CINEMA_ATTR = "cinema";

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
    audioTrack: audioTrackOf(p),
    cinema: p.attributes[CINEMA_ATTR] || null,
  };
}

/** Microfone ligado e recebido: o track para medir o volume aqui */
function audioTrackOf(p: Participant): MediaStreamTrack | null {
  const pub = p.getTrackPublication(Track.Source.Microphone);
  if (!pub || pub.isMuted) return null;
  return pub.track?.mediaStreamTrack ?? null;
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
  const [outputDeviceId, setOutputDeviceIdState] = useState(() => loadDeviceId("audiooutput"));
  const outputDeviceRef = useRef(outputDeviceId);
  const processorRef = useRef<MicProcessor | null>(null);
  // Apertar para falar: tecla segurada agora
  const [pttHeld, setPttHeld] = useState(false);
  const pttHeldRef = useRef(false);
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
  // Mensagens de dados da sala (ex.: comandos do cinema), por quem se inscreveu
  const dataListeners = useRef(new Set<(topic: string, data: unknown, from: string) => void>());
  // Elementos <audio> dos participantes remotos
  const audioContainer = useRef<HTMLDivElement | null>(null);

  // Fone mutado: não toca o áudio de ninguém e o microfone fica desligado.
  // Vale entre salas (como uma preferência) até a pessoa desmutar.
  const [deafened, setDeafened] = useState(false);
  const deafenedRef = useRef(false);
  // O microfone estava ligado quando mutou o fone? Ao desmutar, volta como estava.
  const micOnBeforeDeafen = useRef(true);

  const volumesRef = useRef(loadVolumes());
  // Quem já estava na sala ao entrar não conta como "entrou"
  const connectedAt = useRef(0);

  /** Som da sala (respeita a preferência e o fone desligado) */
  const cue = (room: Room, kind: "join" | "leave" | "self") => {
    if (roomRef.current !== room || deafenedRef.current || !getNotifyPrefs().roomSounds) return;
    if (kind !== "self" && performance.now() - connectedAt.current < 1500) return;
    void playCue(kind);
  };

  /** Volume de cada pessoa da sala; com o fone desligado, tudo em 0 */
  const applyVolumes = (room: Room | null) => {
    if (!room) return;
    const all = deafenedRef.current ? 0 : getAudioSettings().outputVolume;
    for (const p of room.remoteParticipants.values()) {
      p.setVolume(all * (volumesRef.current.get(p.identity) ?? 1), Track.Source.Microphone);
      p.setVolume(all * (volumesRef.current.get(screenKey(p.identity)) ?? 1), Track.Source.ScreenShareAudio);
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
    await processorRef.current?.destroy();
    processorRef.current = null;
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
          noiseSuppression: browserNoiseSuppression(getAudioSettings().noiseLevel),
          autoGainControl: true,
        },
        audioOutput: { deviceId: await availableDeviceId("audiooutput", outputDeviceRef.current) },
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
          cue(room, "join");
          sync();
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          cue(room, "leave");
          sync();
        })
        .on(RoomEvent.ParticipantNameChanged, sync)
        .on(RoomEvent.ParticipantAttributesChanged, sync)
        .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
          if (!participant || !topic) return;
          let data: unknown;
          try {
            data = JSON.parse(new TextDecoder().decode(payload));
          } catch {
            return;
          }
          dataListeners.current.forEach((l) => l(topic, data, participant.identity));
        })
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.TrackMuted, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.TrackPublished, sync)
        .on(RoomEvent.TrackUnpublished, sync)
        .on(RoomEvent.LocalTrackPublished, (pub) => {
          if (pub.source === Track.Source.Microphone && pub.track instanceof LocalAudioTrack) {
            const processor = new MicProcessor(getAudioSettings());
            processor.setPushToTalk(pttHeldRef.current);
            processorRef.current = processor;
            pub.track.setProcessor(processor).catch((err: Error) => {
              // Sem processador o microfone funciona igual, só sem volume/sensibilidade
              console.warn("processador do microfone indisponível:", err.message);
              processorRef.current = null;
            });
          }
          sync();
        })
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
        connectedAt.current = performance.now();
        cue(room, "self");
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
  const startScreenShare = useCallback(async (sourceId: string, withAudio: boolean, quality: ScreenQuality, sourceName?: string) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const lp = room.localParticipant;
    const { capture, publish, limits } = screenShareOptions(quality);
    const limitCapture = () =>
      lp.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack.applyConstraints(limits).catch(() => {});
    if (!features.nativeScreenShare) {
      // Navegador: ele mesmo mostra o seletor; o som vem junto quando dá
      // (no Chrome, o de uma aba, ou o do PC ao compartilhar a tela inteira)
      try {
        if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
        await lp.setScreenShareEnabled(
          true,
          {
            audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
            systemAudio: "include",
            selfBrowserSurface: "exclude",
            surfaceSwitching: "include",
            ...capture,
          },
          { ...publish, audioPreset: AudioPresets.musicHighQualityStereo, dtx: false, red: false },
        );
        await limitCapture();
      } catch (err) {
        // Cancelou o seletor do navegador: não é erro
        if ((err as Error).name !== "NotAllowedError") {
          setState((s) => ({ ...s, error: `Não foi possível compartilhar a tela: ${(err as Error).message}` }));
        }
      }
      setState((s) => ({ ...s, screenSharing: lp.isScreenShareEnabled, participants: snapshot(room, volumesRef.current) }));
      return;
    }
    try {
      if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
      await native.selectScreenSource(sourceId);
      // Só o vídeo vem do getDisplayMedia; o áudio vem do startScreenAudio abaixo
      await lp.setScreenShareEnabled(
        true,
        { audio: false, ...capture },
        { ...publish, name: sourceName?.slice(0, 80) },
      );
      await limitCapture();
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

  // Preferências de áudio mudaram (página de Configurações): valem na hora
  useEffect(() => {
    // O filtro do navegador vem na captura: mudar ele reinicia o microfone.
    // O RNNoise (nível forte) é trocado no processador, sem reiniciar.
    let noise = browserNoiseSuppression(getAudioSettings().noiseLevel);
    return onAudioSettings((settings) => {
      processorRef.current?.update(settings);
      const room = roomRef.current;
      applyVolumes(room);
      const wanted = browserNoiseSuppression(settings.noiseLevel);
      if (wanted !== noise && room) {
        noise = wanted;
        const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
        if (track instanceof LocalAudioTrack) {
          void track
            .restartTrack({
              deviceId: captureDeviceId(micDeviceRef.current),
              echoCancellation: true,
              noiseSuppression: noise,
              autoGainControl: true,
            })
            .then(() => setState((s) => ({ ...s, micMediaTrack: localMicTrack(room) })))
            .catch((err: Error) => setState((s) => ({ ...s, error: `Não foi possível reiniciar o microfone: ${err.message}` })));
        }
      }
      noise = wanted;
    });
  }, []);

  // Apertar para falar: a escuta global do teclado só fica ligada no modo
  useEffect(() => {
    const syncBinding = () => {
      const s = getAudioSettings();
      void native.setPushToTalk(s.micMode === "ptt" ? s.pttBinding : null);
    };
    syncBinding();
    const offSettings = onAudioSettings(syncBinding);
    const offKey = native.onPushToTalk((pressed) => {
      pttHeldRef.current = pressed;
      setPttHeld(pressed);
      processorRef.current?.setPushToTalk(pressed);
    });
    return () => {
      offSettings();
      offKey();
      void native.setPushToTalk(null);
    };
  }, []);

  /** Troca a saída de som (fone ou alto-falante); numa sala, a troca é na hora */
  const setOutputDevice = useCallback(async (deviceId: string) => {
    outputDeviceRef.current = deviceId;
    setOutputDeviceIdState(deviceId);
    saveDeviceId("audiooutput", deviceId);
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    try {
      await room.switchActiveDevice("audiooutput", deviceId);
    } catch (err) {
      setState((s) => ({ ...s, error: `Não foi possível trocar a saída de som: ${(err as Error).message}` }));
    }
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

  /** Manda uma mensagem para a chamada (entrega garantida, na ordem); com to, só para essas pessoas */
  const sendData = useCallback((topic: string, data: unknown, to?: string[]) => {
    const room = roomRef.current;
    if (room?.state !== ConnectionState.Connected) return;
    void room.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify(data)), { reliable: true, topic, destinationIdentities: to })
      .catch((err: Error) => console.warn("falha ao enviar dados para a sala:", err.message));
  }, []);

  /** Recebe as mensagens de dados da sala; retorna a função que cancela */
  const onData = useCallback((listener: (topic: string, data: unknown, from: string) => void) => {
    dataListeners.current.add(listener);
    return () => void dataListeners.current.delete(listener);
  }, []);

  /** Publica (ou tira, com null) a sessão de cinema que você conduz */
  const setCinemaAttr = useCallback((value: string | null) => {
    const room = roomRef.current;
    if (room?.state !== ConnectionState.Connected) return;
    room.localParticipant.setAttributes({ [CINEMA_ATTR]: value ?? "" }).catch(() => {
      // Sem permissão no ingresso: quem entrar no meio só pega a sessão no próximo aviso
    });
  }, []);

  // "Falando" medido aqui (acende junto com o ícone do microfone); sem áudio
  // medido, fica o do servidor
  const speaking = useSpeaking(new Map(state.participants.map((p) => [p.identity, p.audioTrack])));
  const participants = state.participants.map((p) => {
    const here = speaking.get(p.identity);
    return here === undefined || here === p.isSpeaking ? p : { ...p, isSpeaking: here };
  });

  return {
    ...state,
    participants,
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
    outputDeviceId,
    setOutputDevice,
    pttHeld,
    sendData,
    onData,
    setCinemaAttr,
    setParticipantVolume,
    clearError,
    showError,
  };
}

/** O que useVoiceRoom devolve (estado da chamada + ações) */
export type VoiceRoom = ReturnType<typeof useVoiceRoom>;
