import { useEffect, useState } from "react";
import { DEFAULT_DEVICE, listMicrophones, type MicOption } from "./devices";
import { useMicLevel } from "./useMicLevel";

/**
 * Configurações de voz: escolha do microfone com um medidor ao vivo.
 * O teste usa uma captura própria, então funciona dentro ou fora de uma sala.
 */
export function VoiceSettings({
  micDeviceId,
  onChangeMic,
  onClose,
}: {
  micDeviceId: string;
  onChangeMic: (deviceId: string) => void;
  onClose: () => void;
}) {
  const [mics, setMics] = useState<MicOption[]>([]);
  const [testTrack, setTestTrack] = useState<MediaStreamTrack | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const { level, speaking } = useMicLevel(testTrack);

  // Captura de teste do microfone escolhido (mesmo tratamento de áudio da sala)
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setTestError(null);

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: micDeviceId === DEFAULT_DEVICE ? undefined : { exact: micDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        setTestTrack(s.getAudioTracks()[0] ?? null);
        // Com a permissão concedida, a lista passa a vir com os nomes
        return listMicrophones().then(setMics);
      })
      .catch((err: Error) => {
        if (!cancelled) setTestError(`Não foi possível abrir este microfone: ${err.message}`);
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setTestTrack(null);
    };
  }, [micDeviceId]);

  // Atualiza a lista quando um microfone é conectado ou desconectado
  useEffect(() => {
    const refresh = () => void listMicrophones().then(setMics);
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Microfone salvo que não está conectado agora: mantém visível na lista
  const options = mics.some((m) => m.deviceId === micDeviceId)
    ? mics
    : [...mics, { deviceId: micDeviceId, label: "Microfone desconectado" }];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="voice-settings-title">
        <header className="modal-header">
          <h2 id="voice-settings-title">Configurações de voz</h2>
          <button className="link-button" onClick={onClose}>
            fechar
          </button>
        </header>

        <label className="field">
          <span className="field-label">Microfone</span>
          <select value={micDeviceId} onChange={(e) => onChangeMic(e.target.value)}>
            {options.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label">Teste do microfone</span>
          <div className="meter">
            <div className={`meter-fill ${speaking ? "speaking" : ""}`} style={{ width: `${level * 100}%` }} />
          </div>
          <span className="muted-text">
            {testError ?? (speaking ? "Captando sua voz." : "Fale algo: a barra deve se mexer.")}
          </span>
        </div>
      </div>
    </div>
  );
}
