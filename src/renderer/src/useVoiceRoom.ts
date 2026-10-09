import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  LocalAudioTrack,
  Participant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { fetchToken } from "./api";

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

export interface VoiceState {
  /** Slug da sala em que estamos (ou tentando entrar) */
  room: string | null;
  connection: ConnectionState;
  participants: VoiceParticipant[];
  muted: boolean;
  /** Track do nosso microfone, para medir o volume localmente */
  micTrack: LocalAudioTrack | null;
  error: string | null;
}

const initialState: VoiceState = {
  room: null,
  connection: ConnectionState.Disconnected,
  participants: [],
  muted: false,
  micTrack: null,
  error: null,
};

function toVoiceParticipant(p: Participant, isLocal: boolean): VoiceParticipant {
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    isMuted: !p.isMicrophoneEnabled,
  };
}

function localMicTrack(room: Room): LocalAudioTrack | null {
  const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  return track instanceof LocalAudioTrack ? track : null;
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
        audioCaptureDefaults: {
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
          micTrack: localMicTrack(room),
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
      micTrack: localMicTrack(room),
    }));
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

  return { ...state, join, leave, toggleMute, clearError, isOwnIdentity };
}
