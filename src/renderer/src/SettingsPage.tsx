import { useEffect, useRef, useState } from "react";
import { Bell, Check, CircleAlert, ImageOff, ImagePlus, Keyboard, LogOut, Mic, Moon, Play, User, Video, X } from "lucide-react";
import { ApiError, removePhoto, updateProfile, uploadPhoto, type Account, type Avatar as AvatarKind, type Profile } from "./api";
import { GATE_MAX_DB, GATE_MIN_DB, MAX_GAIN, rmsToDb, useAudioSettings } from "./audioSettings";
import { DEFAULT_DEVICE, captureDeviceId, listDevices, type DeviceKind, type DeviceOption } from "./devices";
import { toBase64 } from "./chatImage";
import { PHOTO_ACCEPT, preparePhoto } from "./profilePhoto";
import { SHORTCUT_INFO, safeForToggle, sameBinding, setShortcut, useShortcuts, type SavedShortcut } from "./shortcuts";
import type { ShortcutAction, ShortcutBinding } from "../../shared/pushToTalk";
import { useNotifyPrefs } from "./notifyPrefs";
import { playCue } from "./sounds";
import { usePalette, useTheme, type Palette, type ThemePreference } from "./theme";
import type { VoiceRoom } from "./useVoiceRoom";
import { Avatar } from "./components/Avatar";
import { AvatarEditor } from "./components/AvatarEditor";
import { Button } from "./components/Button";
import { useConfirm } from "./components/ConfirmDialog";
import { Input } from "./components/Input";
import { Select } from "./components/Select";
import { Slider } from "./components/Slider";
import { Switch } from "./components/Switch";
import { features, native } from "./platform";

export type SettingsSection = "profile" | "voice" | "keys" | "notify" | "look";

const SECTIONS = ([
  { id: "profile", label: "Perfil", icon: <User size={16} aria-hidden="true" /> },
  { id: "voice", label: "Voz e vídeo", icon: <Mic size={16} aria-hidden="true" /> },
  { id: "keys", label: "Atalhos", icon: <Keyboard size={16} aria-hidden="true" /> },
  { id: "notify", label: "Notificações", icon: <Bell size={16} aria-hidden="true" /> },
  { id: "look", label: "Aparência", icon: <Moon size={16} aria-hidden="true" /> },
  // Atalhos globais só existem no app para Windows
] as { id: SettingsSection; label: string; icon: React.ReactNode }[]).filter((s) => s.id !== "keys" || features.globalShortcuts);

/** Configurações: perfil, voz e vídeo, atalhos, notificações, aparência e sair */
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
        {section === "keys" && <ShortcutsSection />}
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
  // Passar o mouse na foto mostra o GIF se mexendo (como quando você fala)
  const [hover, setHover] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();

  const applyAccount = (updated: Account) =>
    onMeChange({ ...me, ...updated, username: me.username, displayName: updated.displayName ?? me.displayName });

  const changePhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const { still, gif } = await preparePhoto(file);
      applyAccount(await uploadPhoto(await toBase64(still), gif ? await toBase64(gif) : undefined));
      setResult({
        ok: true,
        text: gif ? "GIF salvo. Ele fica parado e só se mexe quando você fala." : "Foto salva. Os amigos já veem a nova.",
      });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  };

  const dropPhoto = async () => {
    setBusy(true);
    setResult(null);
    try {
      applyAccount(await removePhoto());
      setResult({ ok: true, text: "Foto removida. Volta a aparecer o seu bichinho." });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  };

  const save = async (changes: { displayName?: string; avatar?: AvatarKind }) => {
    setBusy(true);
    setResult(null);
    try {
      const updated = await updateProfile(changes);
      applyAccount(updated);
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
        <div className="col profile-photo" style={{ gap: 8, alignItems: "center" }}>
          <span onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <Avatar kind={me.avatar} photo={me.photo} size={96} mine talking={hover && !!me.photo?.animated} />
          </span>
          <input
            ref={fileRef}
            type="file"
            accept={PHOTO_ACCEPT}
            hidden
            onChange={(e) => {
              void changePhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button size="sm" icon={<ImagePlus size={15} aria-hidden="true" />} disabled={busy} onClick={() => fileRef.current?.click()}>
            {me.photo ? "Trocar foto" : "Foto ou GIF"}
          </Button>
          {me.photo && (
            <Button size="sm" variant="ghost" icon={<ImageOff size={15} aria-hidden="true" />} disabled={busy} onClick={() => void dropPhoto()}>
              Tirar foto
            </Button>
          )}
        </div>
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
      {me.photo ? (
        <p className="sm muted">
          {me.photo.animated
            ? "Seu GIF fica parado e só se mexe quando você fala (passe o mouse nele para ver). "
            : ""}
          Com foto, o bichinho fica guardado: tire a foto para ele voltar.
        </p>
      ) : (
        <AvatarEditor value={me.avatar} disabled={busy} onSave={(avatar) => save({ avatar })} />
      )}
    </section>
  );
}

/** Detecção de voz ou apertar para falar (com a escolha da tecla) */
function MicModePicker() {
  const [audio, setAudio] = useAudioSettings();
  const [recording, setRecording] = useState(false);
  const ptt = audio.micMode === "ptt";

  // Saiu da tela no meio da escolha: para de escutar o teclado
  useEffect(() => () => void native.cancelRecordPushToTalk(), []);

  const record = async () => {
    setRecording(true);
    const result = await native.recordPushToTalk();
    setRecording(false);
    if (result) setAudio({ micMode: "ptt", pttBinding: result.binding, pttLabel: result.label });
  };

  const modes = [
    { id: "voice" as const, title: "Detecção de voz", hint: "O microfone abre sozinho quando você fala." },
    {
      id: "ptt" as const,
      title: "Apertar para falar",
      hint: features.globalShortcuts
        ? "Só abre enquanto você segura uma tecla, mesmo com o jogo em foco."
        : "Só abre enquanto você segura uma tecla, com esta aba em foco. Para funcionar com o jogo aberto, use o app para Windows.",
    },
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
            onClick={() => (recording ? void native.cancelRecordPushToTalk() : void record())}
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

/** Cada cor: nome e a amostra (fundo escuro, fundo claro e o destaque) */
const PALETTE_OPTIONS: { id: Palette; label: string; dark: string; light: string; accent: string }[] = [
  { id: "amber", label: "Meia-noite", dark: "#08090b", light: "#f6f5f1", accent: "#ffc83a" },
  { id: "ocean", label: "Oceano", dark: "#070a10", light: "#f2f5f9", accent: "#5aa9ff" },
  { id: "forest", label: "Floresta", dark: "#070b09", light: "#f2f6f3", accent: "#4fd68f" },
  { id: "lavender", label: "Lavanda", dark: "#0a0910", light: "#f5f3fa", accent: "#b18cff" },
  { id: "rose", label: "Morango", dark: "#0f080a", light: "#fbf3f5", accent: "#ff7aa2" },
  { id: "sunset", label: "Pôr do sol", dark: "#0e0907", light: "#fbf5f0", accent: "#ff9a4a" },
];

function LookSection() {
  const [theme, setTheme] = useTheme();
  const [palette, setPalette] = usePalette();
  return (
    <section className="sect" aria-labelledby="cfg-a">
      <h3 id="cfg-a">Aparência</h3>
      <span className="label" id="cfg-modo-cor">
        Modo
      </span>
      <div className="theme-pick" role="radiogroup" aria-labelledby="cfg-modo-cor">
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
      <span className="label" id="cfg-cor">
        Cor
      </span>
      <div className="palette-pick" role="radiogroup" aria-labelledby="cfg-cor">
        {PALETTE_OPTIONS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={palette === p.id} onClick={() => setPalette(p.id)}>
            <span className="palette-sw" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${p.dark} 50%, ${p.light} 50%)` }}>
              <i style={{ background: p.accent }} />
            </span>
            <strong className="sm">{p.label}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Atalhos dentro do app (fixos, só para consulta) */
const APP_KEYS: [string[], string][] = [
  [["Enter"], "Envia a mensagem no chat"],
  [["Shift", "Enter"], "Pula linha na mensagem"],
  [["Ctrl", "V"], "Cola uma imagem (print ou imagem copiada) no chat"],
  [["Esc"], "Fecha janelas, menus e a imagem em tela cheia"],
];

/**
 * Atalhos globais: funcionam com outro programa em foco (um jogo, por exemplo).
 * O Windows não deixa o Toca "segurar" a tecla: o outro programa também a recebe.
 */
function ShortcutsSection() {
  const shortcuts = useShortcuts();
  const [audio, setAudio] = useAudioSettings();
  const [recording, setRecording] = useState<ShortcutAction | "ptt" | null>(null);
  const [error, setError] = useState<{ id: ShortcutAction | "ptt"; text: string } | null>(null);

  // Saiu da tela no meio da escolha: para de escutar o teclado
  useEffect(() => () => void native.cancelRecordShortcut(), []);

  /** Nome da outra ação que já usa este atalho */
  const usedBy = (b: ShortcutBinding, except: ShortcutAction | "ptt"): string | null => {
    for (const info of SHORTCUT_INFO) {
      const s = shortcuts[info.id];
      if (info.id !== except && s && sameBinding(s.binding, b)) return info.title;
    }
    if (except !== "ptt" && audio.pttBinding && sameBinding(audio.pttBinding, b)) return "Apertar para falar";
    return null;
  };

  const record = async (id: ShortcutAction | "ptt") => {
    if (recording) {
      await native.cancelRecordShortcut();
      if (recording === id) return;
    }
    setError(null);
    setRecording(id);
    const result: SavedShortcut | null = id === "ptt" ? await native.recordPushToTalk() : await native.recordShortcut();
    setRecording((r) => (r === id ? null : r));
    if (!result) return;
    if (id !== "ptt" && !safeForToggle(result)) {
      setError({ id, text: "Use junto com Ctrl, Alt ou Win (ou F1–F24, ou um botão lateral do mouse), para não disparar enquanto você digita." });
      return;
    }
    const other = usedBy(result.binding, id);
    if (other) {
      setError({ id, text: `${result.label} já é o atalho de "${other}".` });
      return;
    }
    if (id === "ptt") setAudio({ pttBinding: result.binding as typeof audio.pttBinding, pttLabel: result.label });
    else setShortcut(id, result);
  };

  const row = (id: ShortcutAction | "ptt", title: string, hint: React.ReactNode, label: string | null, onClear: () => void) => (
    <div className="sc-row" key={id}>
      <div className="grow col" style={{ gap: 2 }}>
        <strong className="sm">{title}</strong>
        <span className="xs muted">{hint}</span>
        {error?.id === id && (
          <span className="xs sc-err" role="alert">
            <CircleAlert size={13} aria-hidden="true" /> {error.text}
          </span>
        )}
      </div>
      <button type="button" className={`sc-key ${recording === id ? "rec" : ""} ${label ? "set" : ""}`} onClick={() => void record(id)}>
        {recording === id ? "Aperte o atalho… (Esc cancela)" : (label ?? "Definir atalho")}
      </button>
      {label && recording !== id ? (
        <IconButtonX label={`Remover o atalho de ${title.toLowerCase()}`} onClick={onClear} />
      ) : (
        <span className="sc-clear-space" />
      )}
    </div>
  );

  return (
    <>
      <section className="sect" aria-labelledby="cfg-k">
        <div>
          <h3 id="cfg-k">Atalhos</h3>
          <p className="sm muted">
            Funcionam mesmo com outro programa em foco, como um jogo. Clique em um atalho e aperte as teclas. O outro programa também
            recebe a tecla, então escolha uma combinação que ele não use.
          </p>
        </div>
        <div className="panel sc-list">
          {row(
            "ptt",
            "Apertar para falar",
            audio.micMode === "ptt" ? (
              "Segure para falar. Pode ser uma tecla sozinha ou um botão lateral do mouse."
            ) : (
              <>
                Só vale no modo Apertar para falar.{" "}
                <button type="button" className="link-btn" onClick={() => setAudio({ micMode: "ptt" })}>
                  Usar este modo
                </button>
              </>
            ),
            audio.pttLabel,
            () => setAudio({ pttBinding: null, pttLabel: null, micMode: "voice" }),
          )}
          {SHORTCUT_INFO.map((info) => row(info.id, info.title, info.hint, shortcuts[info.id]?.label ?? null, () => setShortcut(info.id, null)))}
        </div>
      </section>
      <section className="sect" aria-labelledby="cfg-k2">
        <h3 id="cfg-k2">No Toca</h3>
        <div className="panel sc-list">
          {APP_KEYS.map(([keys, text]) => (
            <div className="sc-row" key={text}>
              <span className="grow sm">{text}</span>
              <span className="sc-keys">
                {keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && <span className="xs faint"> + </span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function IconButtonX({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ib ib-sm" aria-label={label} data-tip={label} onClick={onClick}>
      <X size={15} aria-hidden="true" />
    </button>
  );
}

