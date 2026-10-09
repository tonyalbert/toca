import { useEffect, useRef } from "react";
import type { VideoTrack } from "livekit-client";

/** Vídeo de uma câmera ou tela compartilhada. A própria câmera aparece espelhada. */
export function VideoView({ track, mirror, className }: { track: VideoTrack; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video ref={ref} className={`video ${mirror ? "mirror" : ""} ${className ?? ""}`} autoPlay playsInline muted />
  );
}
