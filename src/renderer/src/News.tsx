import { useCallback, useEffect, useState } from "react";
import { compareVersions, markSeen, releasesUpTo, seenVersion } from "./changelog";
import { Button } from "./components/Button";
import { Modal } from "./components/Modal";

const newsDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Novidades (botão na barra de cima): depois de atualizar, deixa o botão
 * marcado até a pessoa abrir. Instalação nova não avisa.
 */
export function useNews(version: string | null) {
  const [unseen, setUnseen] = useState(false);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    setOpen(true);
    setUnseen(false);
    if (version) markSeen(version);
  }, [version]);

  useEffect(() => {
    if (!version) return;
    const seen = seenVersion();
    if (!seen) {
      markSeen(version);
      return;
    }
    if (compareVersions(version, seen) <= 0) return;
    const fresh = releasesUpTo(version).filter((r) => compareVersions(r.version, seen) > 0);
    if (fresh.length === 0) {
      markSeen(version); // versão sem novidades escritas
      return;
    }
    setUnseen(true);
  }, [version]);

  return { unseen, open, show, close: () => setOpen(false) };
}

/** O que mudou em cada versão, da mais nova para a mais antiga */
export function NewsModal({ version, onClose }: { version: string | null; onClose: () => void }) {
  const releases = version ? releasesUpTo(version) : [];
  return (
    <Modal
      title="Novidades"
      description={version ? `Você está na versão ${version} (beta). O Toca se atualiza sozinho.` : undefined}
      wide
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="news">
        {releases.map((r) => (
          <article key={r.version} className="news-rel">
            <header>
              <strong>Versão {r.version}</strong>
              {r.version === version && <span className="badge accent">Atual</span>}
              <time className="xs faint" dateTime={r.date}>
                {newsDate.format(new Date(`${r.date}T12:00:00`))}
              </time>
            </header>
            <ul>
              {r.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Modal>
  );
}
