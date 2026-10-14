import workletUrl from "./pcm-player.worklet.js?url";
import { native } from "./platform";

export interface ScreenAudio {
  track: MediaStreamTrack;
  stop: () => void;
}

/**
 * Áudio do computador para o compartilhamento de tela, SEM o som do próprio
 * Toca (as vozes da chamada). O processo principal roda o toca-audio-capture e
 * manda o PCM para cá; um AudioWorklet transforma isso numa faixa de áudio.
 */
export async function startScreenAudio(): Promise<ScreenAudio> {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  let unsubscribe = () => {};
  try {
    await ctx.audioWorklet.addModule(workletUrl);
    const player = new AudioWorkletNode(ctx, "pcm-player", { numberOfInputs: 0, outputChannelCount: [2] });
    const destination = ctx.createMediaStreamDestination();
    player.connect(destination);

    unsubscribe = native.onScreenAudioData((chunk) => {
      // Copia para um ArrayBuffer próprio e transfere para o worklet
      const data = chunk.slice().buffer;
      player.port.postMessage(data, [data]);
    });

    const result = await native.startScreenAudio();
    if (!result.ok) throw new Error(result.error);

    const track = destination.stream.getAudioTracks()[0];
    return {
      track,
      stop: () => {
        unsubscribe();
        void native.stopScreenAudio();
        track.stop();
        player.disconnect();
        void ctx.close();
      },
    };
  } catch (err) {
    unsubscribe();
    void native.stopScreenAudio();
    void ctx.close();
    throw err;
  }
}
