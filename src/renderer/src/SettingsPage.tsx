import { useEffect, useRef, useState } from "react";
import { Bell, Check, CircleAlert, LogOut, Mic, Moon, Play, User, Video } from "lucide-react";
import { ApiError, updateProfile, type Avatar as AvatarKind, type Profile } from "./api";
import { GATE_MAX_DB, GATE_MIN_DB, MAX_GAIN, rmsToDb, useAudioSettings } from "./audioSettings";
import { DEFAULT_DEVICE, captureDeviceId, listDevices, type DeviceKind, type DeviceOption } from "./devices";
import { useNotifyPrefs } from "./notifyPrefs";
import { playCue } from "./sounds";
import { useTheme, type ThemePreference } from "./theme";
import type { VoiceRoom } from "./useVoiceRoom";
import { Avatar } from "./components/Avatar";
import { AvatarEditor } from "./components/AvatarEditor";
import { Button } from "./components/Button";
import { useConfirm } from "./components/ConfirmDialog";
import { Input } from "./components/Input";
import { Select } from "./components/Select";
import { Slider } from "./components/Slider";
import { Switch } from "./components/Switch";

export type SettingsSection = "profile" | "voice" | "notify" | "look";

const SECTIONS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Perfil", icon: <User size={16} aria-hidden="true" /> },
  { id: "voice", label: "Voz e vídeo", icon: <Mic size={16} aria-hidden="true" /> },
  { id: "notify", label: "Notificações", icon: <Bell size={16} aria-hidden="true" /> },
  { id: "look", label: "Aparência", icon: <Moon size={16} aria-hidden="true" /> },
];

/** Configurações: perfil, voz e vídeo, notificações, aparência e sair */
export function SettingsPage({
  me,
  voice,
  section,
  onSection,
  onMeChange,
  onSignOut,
}: {
  me: Profile;
  voice: VoiceRoom;
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onMeChange: (me: Profile) => void;
  onSignOut: () => void;
}) {
  const confirm = useConfirm();
  return (
    <div className="cfg">
      <nav className="cfg-nav" aria-label="Seções das configurações">
        {SECTIONS.map((s) => (
          <button key={s.id} aria-current={section === s.id ? "page" : undefined} onClick={() => onSection(s.id)}>
            {s.icon}
            {s.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          className="danger"
          onClick={async () => {
            const ok = await confirm({
              title: "Sair da conta?",
              message: voice.room ? "Você também sai da sala em que está agora." : "Para voltar, é só entrar de novo com seu e-mail ou @.",
              confirmLabel: "Sair da conta",
              danger: true,
            });
            if (ok) onSignOut();
          }}
        >
          <LogOut size={16} aria-hidden="true" />
          Sair da conta
        </button>
      </nav>
      <div className="cfg-b">
        {section === "profile" && <ProfileSection me={me} onMeChange={onMeChange} />}
        {section === "voice" && <VoiceSection voice={voice} />}
        {section === "notify" && <NotifySection />}
        {section === "look" && <LookSection />}
      </div>
    </div>
  );
}

function ProfileSection({ me, onMeChange }: { me: Profile; onMeChange: (me: Profile) => void }) {
  const [name, setName] = useState(me.displayName);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const trimmed = name.trim();

  const save = async (changes: { displayName?: string; avatar?: AvatarKind }) => {
    setBusy(true);
    setResult(null);
    try {
      const updated = await updateProfile(changes);
      onMeChange({ ...me, ...updated, username: me.username, displayName: updated.displayName ?? me.displayName });
      setResult({ ok: true, text: changes.avatar ? "Avatar salvo. Os amigos já veem o novo." : "Nome salvo. Os amigos já veem o novo." });
      return true;
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError ? err.message : (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sect" aria-labelledby="cfg-p">
      <h3 id="cfg-p">Perfil</h3>
      <div className="panel" style={{ flexDirection: "row", gap: 24, alignItems: "flex-start" }}>
        <Avatar kind={me.avatar} size={96} mine />
        <div className="col grow" style={{ gap: 16 }}>
          <form
            className="row"
            style={{ alignItems: "flex-end", gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed && trimmed !== me.displayName) void save({ displayName: trimmed });
            }}
          >
            <div className="grow">
              <Input label="Nome" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" style={{ height: 44 }} disabled={busy || !trimmed || trimmed === me.displayName}>
              Salvar
            </Button>
          </form>
          {result && (
            <div className={`notice ${result.ok ? "ok" : "error"}`} role={result.ok ? "status" : "alert"}>
              {result.ok ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
              {result.text}
            </div>
          )}
          <div className="grid2">
            <Input label="@usuário" prefix="@" value={me.username} disabled hint="Não dá para trocar." readOnly />
            <Input label="E-mail" value={me.email ?? "Não cadastrado"} disabled readOnly />
          </div>

        </div>
      </div>
      <AvatarEditor value={me.avatar} disabled={busy} onSave={(avatar) => save({ avatar })} />
    </section>
  );
}

/** Detecção de voz ou apertar para falar (com a escolha da tecla) */
function MicModePicker() {
  const [audio, setAudio] = useAudioSettings();
  const [recording, setRecording] = useState(false);
  const ptt = audio.micMode === "ptt";

  // Saiu da tela no meio da escolha: para de escutar o teclado
  useEffect(() => () => void window.toca.cancelRecordPushToTalk(), []);

  const record = async () => {
    setRecording(true);
    const result = await window.toca.recordPushToTalk();
    setRecording(false);
    if (result) setAudio({ micMode: "ptt", pttBinding: result.binding, pttLabel: result.label });
  };

  const modes = [
    { id: "voice" as const, title: "Detecção de voz", hint: "O microfone abre sozinho quando você fala." },
    { id: "ptt" as const, title: "Apertar para falar", hint: "Só abre enquanto você segura uma tecla, mesmo com o jogo em foco." },
  ];
  return (
    <div className="field">
      <span className="label" id="cfg-modo">
        Modo do microfone
      </span>
      <div className="mode-pick" role="radiogroup" aria-labelledby="cfg-modo">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={audio.micMode === m.id}
            onClick={() => {
              setAudio({ micMode: m.id });
              if (m.id === "ptt" && !audio.pttBinding) void record();
            }}
          >
            <strong className="sm">{m.title}</strong>
            <span className="xs muted">{m.hint}</span>
          </button>
        ))}
      </div>
      {ptt && (
        <div className="row" style={{ gap: 12, marginTop: 6 }}>
          <span className="sm">Tecla</span>
          <Button
            size="sm"
            variant={recording ? "primary" : "secondary"}
            onClick={() => (recording ? void window.toca.cancelRecordPushToTalk() : void record())}
          >
            {recording ? "Aperte uma tecla ou botão lateral do mouse… (Esc cancela)" : (audio.pttLabel ?? "Escolher tecla")}
          </Button>
          {!recording && audio.pttLabel && <span className="xs muted">Clique para trocar.</span>}
        </div>
      )}
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
  // Dispositivo salvo que não está conectado agora: continua na lista
  const missing = { deviceId, label: deviceId === DEFAULT_DEVICE ? "Padrão do Windows" : "Dispositivo desconectado" };
  const options = devices.some((d) => d.deviceId === deviceId) ? devices : [...devices, missing];
  return <Select label={label} value={deviceId} onChange={onChange} options={options.map((d) => ({ value: d.deviceId, label: d.label }))} />;
}

const constraint = (deviceId: string): ConstrainDOMString | undefined => {
  const id = captureDeviceId(deviceId);
  return id ? { exact: id } : undefined;
};

/** Nível do microfone de teste em dB, ~20 vezes por segundo */
function useMicDb(track: MediaStreamTrack | null): number {
  const [db, setDb] = useState(-100);
  useEffect(() => {
    if (!track) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      setDb(Math.round(rmsToDb(Math.sqrt(sum / samples.length))));
    }, 50);
    return () => {
      clearInterval(id);
      source.disconnect();
      void ctx.close();
    };
  }, [track]);
  return db;
}

/** dB → posição na barra (de -70 dB a 0 dB) */
const dbToPct = (db: number) => Math.max(0, Math.min(100, ((db - GATE_MIN_DB) / -GATE_MIN_DB) * 100));

function VoiceSection({ voice }: { voice: VoiceRoom }) {
  const [audio, setAudio] = useAudioSettings();
  const [testTrack, setTestTrack] = useState<MediaStreamTrack | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const mics = useDeviceList("audioinput", !!testTrack);
  const outputs = useDeviceList("audiooutput", !!testTrack);

  // Captura de teste do microfone escolhido (mesmo tratamento de áudio da sala)
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setTestError(null);
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: constraint(voice.micDeviceId),
          echoCancellation: true,
          noiseSuppression: audio.noiseSuppression,
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
  }, [voice.micDeviceId, audio.noiseSuppression]);

  // O que os outros ouvem: o nível depois do volume do microfone
  const rawDb = useMicDb(testTrack);
  const db = rawDb + 20 * Math.log10(Math.max(audio.micGain, 0.01));
  const ptt = audio.micMode === "ptt";
  const passing = ptt ? voice.pttHeld : audio.autoSensitivity || db >= audio.gateDb;

  return (
    <>
      <section className="sect" aria-labelledby="cfg-v">
        <h3 id="cfg-v">Voz</h3>
        <div className="panel">
          <div className="grid2">
            <DeviceSelect label="Microfone" deviceId={voice.micDeviceId} devices={mics} onChange={(id) => void voice.setMicDevice(id)} />
            <DeviceSelect
              label="Fone ou alto-falante"
              deviceId={voice.outputDeviceId}
              devices={outputs}
              onChange={(id) => void voice.setOutputDevice(id)}
            />
          </div>

          <div className="grid2">
            <Slider
              label="Volume do microfone"
              value={Math.round(audio.micGain * 100)}
              min={0}
              max={MAX_GAIN * 100}
              step={5}
              format={(v) => `${v}%`}
              onChange={(v) => setAudio({ micGain: v / 100 })}
              hint={
                testError ??
                (ptt && !voice.pttHeld
                  ? `Segure ${audio.pttLabel ?? "a tecla"} e fale: a barra mostra o que os amigos ouvem.`
                  : passing && db > GATE_MIN_DB
                    ? "Assim os amigos te ouvem."
                    : "Fale algo: a barra mostra o nível que os amigos ouvem.")
              }
            >
              <div className="meter" aria-hidden="true">
                <i className={passing ? "" : "closed"} style={{ width: `${dbToPct(db)}%` }} />
                {!ptt && !audio.autoSensitivity && <b className="gate-mark" style={{ left: `${dbToPct(audio.gateDb)}%` }} />}
              </div>
            </Slider>
            <div className="col" style={{ gap: 6 }}>
              <Slider
                label="Volume do que você ouve"
                value={Math.round(audio.outputVolume * 100)}
                min={0}
                max={MAX_GAIN * 100}
                step={5}
                format={(v) => `${v}%`}
                onChange={(v) => setAudio({ outputVolume: v / 100 })}
                hint="Vale para todos da sala. O volume de cada pessoa fica no cartão dela."
              />
              <Button
                size="sm"
                style={{ alignSelf: "flex-start" }}
                icon={<Play size={14} aria-hidden="true" />}
                onClick={() => void playCue("test")}
              >
                Tocar som de teste
              </Button>
            </div>
          </div>

          <div className="sep-line" />
          <MicModePicker />
          {!ptt && (
            <>
          <Switch
            checked={audio.autoSensitivity}
            onChange={(v) => setAudio({ autoSensitivity: v })}
            label="Sensibilidade automática"
            description="O microfone fica sempre aberto. Desligue para escolher a partir de que volume ele abre (bom para teclado barulhento)."
          />
          {!audio.autoSensitivity && (
            <Slider
              label="Sensibilidade"
              value={audio.gateDb}
              min={GATE_MIN_DB}
              max={GATE_MAX_DB}
              step={1}
              format={(v) => `${v} dB`}
              onChange={(v) => setAudio({ gateDb: v })}
              hint={passing ? "Você está acima da linha: os amigos te ouvem." : "Abaixo da linha da barra, ninguém te ouve."}
            />
          )}
            </>
          )}
          <div className="sep-line" />
          <Switch
            checked={audio.noiseSuppression}
            onChange={(v) => setAudio({ noiseSuppression: v })}
            label="Reduzir ruído de fundo"
            description="Corta teclado, ventilador e barulho da rua."
          />
        </div>
      </section>

      <section className="sect" aria-labelledby="cfg-c">
        <h3 id="cfg-c">Vídeo</h3>
        <CameraPanel deviceId={voice.cameraDeviceId} onChange={(id) => void voice.setCameraDevice(id)} />
      </section>
    </>
  );
}

function CameraPanel({ deviceId, onChange }: { deviceId: string; onChange: (id: string) => void }) {
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
      .getUserMedia({ video: { deviceId: constraint(deviceId), width: 1280, height: 720 } })
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
    <div className="panel">
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <div className="grow">
          <DeviceSelect label="Câmera" deviceId={deviceId} devices={devices} onChange={onChange} />
        </div>
        <Button style={{ height: 44 }} icon={<Video size={15} aria-hidden="true" />} onClick={() => setTesting((t) => !t)}>
          {testing ? "Parar teste" : "Testar câmera"}
        </Button>
      </div>
      {testing && (
        <div className="cam-preview">
          {stream ? (
            <video ref={videoRef} className="video mirror" autoPlay playsInline muted />
          ) : (
            <span className="sm muted">{testError ?? "Abrindo a câmera…"}</span>
          )}
        </div>
      )}
    </div>
  );
}

function NotifySection() {
  const [prefs, setPrefs] = useNotifyPrefs();
  return (
    <section className="sect" aria-labelledby="cfg-n">
      <h3 id="cfg-n">Notificações</h3>
      <div className="panel">
        <Switch
          checked={prefs.friendRequests}
          onChange={(v) => setPrefs({ friendRequests: v })}
          label="Pedidos de amizade"
          description="Quando alguém quiser ser seu amigo ou aceitar o seu pedido."
        />
        <div className="sep-line" />
        <Switch
          checked={prefs.roomAdded}
          onChange={(v) => setPrefs({ roomAdded: v })}
          label="Novas salas"
          description="Quando alguém te adicionar a uma sala."
        />
        <div className="sep-line" />
        <Switch
          checked={prefs.dmMessages}
          onChange={(v) => setPrefs({ dmMessages: v })}
          label="Mensagens diretas"
          description="Quando alguém te mandar uma mensagem."
        />
        <div className="sep-line" />
        <Switch
          checked={prefs.roomMessages}
          onChange={(v) => setPrefs({ roomMessages: v })}
          label="Mensagens das salas"
          description="Avisa cada mensagem nova no chat das suas salas. Desligado, só aparece o número de não lidas."
        />
        <div className="sep-line" />
        <Switch
          checked={prefs.roomSounds}
          onChange={(v) => setPrefs({ roomSounds: v })}
          label="Sons da sala"
          description="Um toque curto quando alguém entra ou sai da sala em que você está."
        />
        <div className="sep-line" />
        <Switch
          checked={prefs.windowsWhenHidden}
          onChange={(v) => setPrefs({ windowsWhenHidden: v })}
          label="Avisar com o Toca em segundo plano"
          description="Com o app minimizado ou na bandeja, os avisos aparecem no canto da tela do Windows."
        />
      </div>
    </section>
  );
}

const THEMES: { id: ThemePreference; label: string; hint: string }[] = [
  { id: "dark", label: "Escuro", hint: "Meia-noite" },
  { id: "light", label: "Claro", hint: "Para o dia" },
  { id: "system", label: "Sistema", hint: "Igual ao Windows" },
];

function LookSection() {
  const [theme, setTheme] = useTheme();
  return (
    <section className="sect" aria-labelledby="cfg-a">
      <h3 id="cfg-a">Aparência</h3>
      <div className="theme-pick" role="radiogroup" aria-labelledby="cfg-a">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} onClick={() => setTheme(t.id)}>
            <span className={`theme-sw ${t.id}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong className="sm">{t.label}</strong>
            <span className="xs muted">{t.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
