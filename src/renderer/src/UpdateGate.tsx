import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import type { UpdateState } from "../../shared/update";
import { Button } from "./components/Button";

/** Segundos até atualizar sozinho, com a tela de atualização aberta */
const COUNTDOWN_S = 20;
/** "Daqui a pouco" adia por isto; depois a tela volta */
const SNOOZE_MS = 10 * 60 * 1000;
/** Com o app na bandeja, de quanto em quanto tempo confere se dá para atualizar */
const HIDDEN_POLL_MS = 30 * 1000;

/**
 * Atualização quase obrigatória: com a versão nova baixada e ninguém em
 * chamada, o app atualiza sozinho. Na bandeja ou minimizado, na hora e sem
 * avisar (volta do mesmo jeito); à vista, mostra uma contagem regressiva que
 * dá para adiar por alguns minutos. Em chamada, espera ela acabar (o aviso
 * fica no topo da tela da sala).
 */
export function UpdateGate({ update, inCall, onInstall }: { update: UpdateState; inCall: boolean; onInstall: () => void }) {
  const ready = update.status === "downloaded" && !inCall;
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [visible, setVisible] = useState(true);
  const [left, setLeft] = useState(COUNTDOWN_S);
  const installing = useRef(false);

  const install = () => {
    if (installing.current) return;
    installing.current = true;
    onInstall();
  };

  // Janela escondida na bandeja ou minimizada: atualiza sem incomodar
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const look = () =>
      void window.toca.isWindowVisible().then((v) => {
        if (!active) return;
        setVisible(v);
        if (!v) install();
      });
    look();
    const id = setInterval(look, HIDDEN_POLL_MS);
    document.addEventListener("visibilitychange", look);
    window.addEventListener("focus", look);
    window.addEventListener("blur", look);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", look);
      window.removeEventListener("focus", look);
      window.removeEventListener("blur", look);
    };
  }, [ready]);

  // Adiou: a tela volta quando passar o tempo
  useEffect(() => {
    if (snoozedUntil <= now) return;
    const id = setTimeout(() => setNow(Date.now()), snoozedUntil - now);
    return () => clearTimeout(id);
  }, [snoozedUntil, now]);

  const open = ready && visible && snoozedUntil <= now;

  // Contagem regressiva; chegou a zero, atualiza
  useEffect(() => {
    if (!open) return;
    setLeft(COUNTDOWN_S);
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [open]);
  useEffect(() => {
    if (open && left === 0) install();
  }, [open, left]);

  if (!open || update.status !== "downloaded") return null;

  return createPortal(
    <div className="update-ov">
      <div className="dialog update-gate" role="alertdialog" aria-modal="true" aria-labelledby="update-gate-t" aria-describedby="update-gate-d">
        <span className="update-gate-ico" aria-hidden="true">
          <Download size={22} />
        </span>
        <h2 id="update-gate-t">Tem versão nova do Toca</h2>
        <p id="update-gate-d" className="muted">
          A versão {update.version} já foi baixada e traz novidades. O app reinicia em segundos e você continua de onde parou.
        </p>
        <div className="update-gate-bar" aria-hidden="true">
          <span style={{ width: `${((COUNTDOWN_S - left) / COUNTDOWN_S) * 100}%` }} />
        </div>
        <p className="sm muted num" aria-live="polite">
          Atualizando sozinho em {left} {left === 1 ? "segundo" : "segundos"}…
        </p>
        <div className="dialog-f">
          <Button
            variant="ghost"
            onClick={() => {
              const until = Date.now() + SNOOZE_MS;
              setSnoozedUntil(until);
              setNow(Date.now());
            }}
          >
            Daqui a 10 min
          </Button>
          <Button variant="primary" autoFocus icon={<Download size={15} aria-hidden="true" />} onClick={install}>
            Atualizar agora
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
