import { ConnectionState, Track, type Room } from "livekit-client";

/** Qualidade da sua chamada, medida pelas estatísticas do WebRTC */
export interface CallStats {
  /** 0 a 100: nota de voz (modelo E, o mesmo usado em telefonia), 100 = perfeita */
  score: number;
  /** Ping até o servidor, em ms */
  rtt: number;
  /** Pacotes de áudio perdidos (o pior entre enviar e receber), em % */
  loss: number;
  /** Variação no tempo de chegada dos pacotes, em ms */
  jitter: number;
}

/** Contadores da medição anterior, para calcular a perda só no intervalo */
export type StatsCounters = Map<string, { lost: number; received: number }>;

/**
 * Mede a chamada agora: ping, perda e jitter do seu microfone (o que o
 * servidor conta que recebeu) e do áudio dos outros (o que chega até você).
 * Sem nenhum áudio indo ou vindo, devolve null.
 */
export async function measureCall(room: Room, prev: StatsCounters): Promise<{ stats: CallStats | null; counters: StatsCounters }> {
  const counters: StatsCounters = new Map();
  if (room.state !== ConnectionState.Connected) return { stats: null, counters };

  const reports: RTCStatsReport[] = [];
  const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  const tracks = [
    mic,
    ...[...room.remoteParticipants.values()].map((p) => p.getTrackPublication(Track.Source.Microphone)?.track),
  ];
  await Promise.all(
    tracks.map(async (t) => {
      const r = await t?.getRTCStatsReport().catch(() => undefined);
      if (r) reports.push(r);
    }),
  );
  if (reports.length === 0) return { stats: null, counters };

  let rtt = -1;
  let jitter = 0;
  let sendLoss = 0;
  let lost = 0;
  let received = 0;
  for (const report of reports) {
    report.forEach((s) => {
      if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded" && typeof s.currentRoundTripTime === "number") {
        rtt = Math.max(rtt, s.currentRoundTripTime * 1000);
      } else if (s.type === "remote-inbound-rtp" && s.kind === "audio") {
        // O que o servidor viu do seu microfone
        if (typeof s.roundTripTime === "number") rtt = Math.max(rtt, s.roundTripTime * 1000);
        if (typeof s.fractionLost === "number") sendLoss = Math.max(sendLoss, s.fractionLost * 100);
        if (typeof s.jitter === "number") jitter = Math.max(jitter, s.jitter * 1000);
      } else if (s.type === "inbound-rtp" && s.kind === "audio") {
        // O que chega até você do áudio dos outros
        const now = { lost: s.packetsLost ?? 0, received: s.packetsReceived ?? 0 };
        const before = prev.get(s.id);
        counters.set(s.id, now);
        if (before) {
          lost += Math.max(0, now.lost - before.lost);
          received += Math.max(0, now.received - before.received);
        }
        if (typeof s.jitter === "number") jitter = Math.max(jitter, s.jitter * 1000);
      }
    });
  }
  if (rtt < 0) return { stats: null, counters };

  const recvLoss = lost + received > 0 ? (lost / (lost + received)) * 100 : 0;
  const loss = Math.max(sendLoss, recvLoss);
  return { stats: { score: voiceScore(rtt, jitter, loss), rtt: Math.round(rtt), loss, jitter: Math.round(jitter) }, counters };
}

/**
 * Modelo E simplificado: o atraso efetivo (ping + jitter dobrado + codec) e a
 * perda de pacotes descontam do fator R (93,2 = perfeito), que vira 0 a 100.
 */
function voiceScore(rtt: number, jitter: number, loss: number): number {
  const latency = rtt + jitter * 2 + 10;
  let r = latency < 160 ? 93.2 - latency / 40 : 93.2 - (latency - 120) / 10;
  r -= loss * 2.5;
  return Math.round(Math.min(100, Math.max(0, (r / 93.2) * 100)));
}

/** Rótulo da nota (combina com os níveis do LiveKit) */
export function scoreLabel(score: number): string {
  return score >= 85 ? "Ótima" : score >= 65 ? "Boa" : score >= 40 ? "Instável" : "Ruim";
}
