import { useEffect, useRef, useState } from "react";
import { captureDeviceId, listDevices, type DeviceKind, type DeviceOption } from "./devices";
import { useMicLevel } from "./useMicLevel";
import { Select } from "./components/Select";

/**
 * Configurações de voz e vídeo: escolha do microfone (com medidor ao vivo) e da
 * câmera (com prévia). Os testes usam capturas próprias, então funcionam dentro
 * ou fora de uma sala.
 */
export function VoiceSettings({
  micDeviceId,
  cameraDeviceId,
  onChangeMic,
  onChangeCamera,
  onClose,
}: {
  micDeviceId: string;
  cameraDeviceId: string;
  onChangeMic: (deviceId: string) => void;
  onChangeCamera: (deviceId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="voice-settings-title">
        <header className="modal-header">
          <h2 id="voice-settings-title">Configurações de voz e vídeo</h2>
          <button className="link-button" onClick={onClose}>
            fechar
          </button>
        </header>
        <MicSection deviceId={micDeviceId} onChange={onChangeMic} />
        <CameraSection deviceId={cameraDeviceId} onChange={onChangeCamera} />
      </div>
    </div>
  );
}

/** Lista de dispositivos, atualizada quando algo é conectado ou desconectado */
function useDeviceList(kind: DeviceKind, ready: boolean) {
  const [devices, setDevices] = useState<DeviceOption[]>([]);

  useEffect(() => {
    const refresh = () => void listDevices(kind).then(setDevices);
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
    // "ready" muda quando a permissão é concedida e os nomes passam a aparecer
  }, [kind, ready]);

  return devices;
}

function DeviceSelect({
  label,
  deviceId,
  devices,
  onChange,
}: {
  label: string;
  deviceId: string;
  devices: DeviceOption[];
  onChange: (deviceId: string) => void;
}) {
  // Dispositivo salvo que não está conectado agora: mantém visível na lista
  const options = devices.some((d) => d.deviceId === deviceId)
    ? devices
    : [...devices, { deviceId, label: "Dispositivo desconectado" }];

  return (
    <Select
      label={label}
      value={deviceId}
      onChange={onChange}
      options={options.map((d) => ({ value: d.deviceId, label: d.label }))}
    />
  );
}

function MicSection({ deviceId, onChange }: { deviceId: string; onChange: (id: string) => void }) {
  const [testTrack, setTestTrack] = useState<MediaStreamTrack | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const devices = useDeviceList("audioinput", !!testTrack);
  const { level, speaking } = useMicLevel(testTrack);

  // Captura de teste do microfone escolhido (mesmo tratamento de áudio da sala)
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setTestError(null);

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: deviceIdConstraint(deviceId),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        setTestTrack(s.getAudioTracks()[0] ?? null);
      })
      .catch((err: Error) => {
        if (!cancelled) setTestError(`Não foi possível abrir este microfone: ${err.message}`);
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setTestTrack(null);
    };
  }, [deviceId]);

  return (
    <section className="settings-section">
      <DeviceSelect label="Microfone" deviceId={deviceId} devices={devices} onChange={onChange} />
      <div className="form-field">
        <span className="field-label">Teste do microfone</span>
        <div className="meter">
          <div className={`meter-fill ${speaking ? "speaking" : ""}`} style={{ width: `${level * 100}%` }} />
        </div>
        <span className="muted-text">
          {testError ?? (speaking ? "Captando sua voz." : "Fale algo: a barra deve se mexer.")}
        </span>
      </div>
    </section>
  );
}

function CameraSection({ deviceId, onChange }: { deviceId: string; onChange: (id: string) => void }) {
  // A prévia só liga quando pedida, para a luz da câmera não acender à toa
  const [testing, setTesting] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const devices = useDeviceList("videoinput", !!stream);

  useEffect(() => {
    if (!testing) return;
    let current: MediaStream | null = null;
    let cancelled = false;
    setTestError(null);

    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: deviceIdConstraint(deviceId), width: 1280, height: 720 } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        current = s;
        setStream(s);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const hint = err.name === "NotReadableError" ? " (outro programa pode estar usando a câmera)" : "";
        setTestError(`Não foi possível abrir esta câmera: ${err.message}${hint}`);
      });

    return () => {
      cancelled = true;
      current?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [testing, deviceId]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <section className="settings-section">
      <DeviceSelect label="Câmera" deviceId={deviceId} devices={devices} onChange={onChange} />
      <div className="form-field">
        <div className="field-row">
          <span className="field-label">Prévia da câmera</span>
          <button className="secondary" onClick={() => setTesting((t) => !t)}>
            {testing ? "Parar teste" : "Testar câmera"}
          </button>
        </div>
        {testing && (
          <div className="camera-preview">
            {stream ? (
              <video ref={videoRef} className="tile-video mirror" autoPlay playsInline muted />
            ) : (
              <span className="muted-text">{testError ?? "Abrindo a câmera…"}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function deviceIdConstraint(deviceId: string): ConstrainDOMString | undefined {
  const id = captureDeviceId(deviceId);
  return id ? { exact: id } : undefined;
}
