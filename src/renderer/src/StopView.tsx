import { useEffect, useState } from "react";
import { Check, Crown, Hand, Square, X } from "lucide-react";
import { activePlayers, approved, roundScores, startsWith, voteKey, type StopGame, type StopSettings } from "./stopGame";
import { normalize } from "./drawGame";
import { Button } from "./components/Button";

const SETTINGS_KEY = "toca.stop.config";

export function lastStopSettings(): StopSettings | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as StopSettings | null;
    return raw && Array.isArray(raw.categories) && raw.categories.length >= 3 ? raw : null;
  } catch {
    return null;
  }
}

export function saveStopSettings(s: StopSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // só nesta sessão
  }
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** O jogo Stop na sala */
export function StopView({ stop }: { stop: StopGame }) {
  const g = stop.game!;
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(timer);
  }, []);

  const left = stop.remaining();
  const active = activePlayers(g);
  const name = (id: string | null) => g.players.find((p) => p.id === id)?.name ?? "Alguém";
  const hostName = g.host === stop.me ? "você" : name(g.host);
  const ranking = [...g.players].sort((a, b) => b.score - a.score);

  return (
    <div className="st">
      <div className="st-main">
        <div className="st-top">
          <span className="st-letter" aria-label={`Letra ${g.letter}`}>
            {g.letter}
          </span>
          <div className="grow">
            <strong>
              Stop · rodada {g.round} de {g.settings.rounds}
            </strong>
            <span className="sm muted">
              {g.phase === "writing" && "Preencha tudo com a letra e aperte STOP."}
              {g.phase === "stopping" && `STOP de ${g.stoppedBy ? (g.stoppedBy === stop.me ? "você" : name(g.stoppedBy)) : "tempo esgotado"}: as respostas travam já já.`}
              {g.phase === "review" && "Correção: marque as respostas dos outros que valem. Só conta ponto o que a turma validar."}
              {g.phase === "end" && "Fim de jogo!"}
            </span>
          </div>
          {(g.phase === "writing" || g.phase === "stopping") && (
            <span className={`st-clock num ${g.phase === "stopping" || left < 10_000 ? "hot" : ""}`}>{clock(left)}</span>
          )}
          <Button size="sm" variant="ghost" icon={<Square size={14} aria-hidden="true" />} onClick={stop.end}>
            Encerrar
          </Button>
        </div>

        {(g.phase === "writing" || g.phase === "stopping") && <Writing stop={stop} />}
        {g.phase === "review" && <Review stop={stop} hostName={hostName} />}
        {g.phase === "end" && (
          <div className="st-end">
            <Crown size={36} aria-hidden="true" className="st-crown" />
            <h2>{ranking[0]?.id === stop.me ? "Você ganhou!" : `${ranking[0]?.name ?? "Alguém"} ganhou!`}</h2>
            <ol className="st-rank">
              {ranking.map((p, i) => (
                <li key={p.id} className={p.id === stop.me ? "is-me" : ""}>
                  <span className="num st-pos">{i + 1}º</span>
                  <span className="grow">{p.id === stop.me ? "Você" : p.name}</span>
                  <b className="num">{p.score} pts</b>
                </li>
              ))}
            </ol>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              {stop.isHost && (
                <Button variant="primary" onClick={() => stop.start(g.settings)}>
                  Jogar de novo
                </Button>
              )}
              <Button onClick={stop.end}>Fechar</Button>
            </div>
          </div>
        )}
      </div>

      <aside className="st-side" aria-label="Placar">
        <ul className="st-players">
          {ranking.map((p) => (
            <li key={p.id} className={`${p.id === stop.me ? "is-me" : ""} ${p.active ? "" : "away"}`}>
              <span className="grow">
                {p.id === stop.me ? "Você" : p.name}
                {p.id === g.host && <span className="xs muted"> · conduz</span>}
              </span>
              <b className="num">{p.score}</b>
            </li>
          ))}
        </ul>
        <p className="xs muted">
          Só vale ponto a resposta que pelo menos metade dos outros jogadores marcar como válida: 10 se só você respondeu, 5 se alguém respondeu igual. Vazia ou com outra letra vale 0.
        </p>
        {!active.some((p) => p.id === stop.me) && g.phase !== "end" && (
          <p className="sm muted">Você chegou no meio: entra na próxima rodada.</p>
        )}
      </aside>
    </div>
  );
}

function Writing({ stop }: { stop: StopGame }) {
  const g = stop.game!;
  const locked = g.phase === "stopping" && stop.remaining() <= 0;
  if (!stop.playing) {
    return (
      <div className="st-wait">
        <Hand size={28} aria-hidden="true" />
        <p>A turma está escrevendo com a letra {g.letter}. Você entra na próxima rodada.</p>
      </div>
    );
  }
  const filled = stop.answers.every((a) => normalize(a) !== "");
  return (
    <form
      className="st-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (filled) stop.stop();
      }}
    >
      {g.phase === "stopping" && (
        <div className="st-banner" role="alert">
          STOP!
        </div>
      )}
      <div className="st-fields">
        {g.settings.categories.map((c, i) => {
          const value = stop.answers[i] ?? "";
          const ok = normalize(value) !== "" && startsWith(value, g.letter);
          const wrong = normalize(value) !== "" && !ok;
          return (
            <label key={c} className={`st-field ${ok ? "ok" : ""} ${wrong ? "wrong" : ""}`}>
              <span className="xs">{c}</span>
              <span className="st-input">
                <input
                  className="input"
                  value={value}
                  disabled={locked}
                  autoFocus={i === 0}
                  maxLength={60}
                  spellCheck={false}
                  placeholder={`${g.letter}…`}
                  onChange={(e) => stop.setAnswer(i, e.target.value)}
                />
                {ok && <Check size={16} aria-label="começa com a letra" />}
                {wrong && <X size={16} aria-label={`não começa com ${g.letter}`} />}
              </span>
            </label>
          );
        })}
      </div>
      {g.phase === "writing" && (
        <Button type="submit" variant="primary" className="st-stop" disabled={!filled} data-tip={filled ? undefined : "Preencha todas para apertar"}>
          STOP!
        </Button>
      )}
    </form>
  );
}

function Review({ stop, hostName }: { stop: StopGame; hostName: string }) {
  const g = stop.game!;
  const active = activePlayers(g);
  const scores = roundScores(g);
  return (
    <div className="st-review">
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th />
              {active.map((p) => (
                <th key={p.id}>{p.id === stop.me ? "Você" : p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.settings.categories.map((c, ci) => (
              <tr key={c}>
                <th scope="row">{c}</th>
                {active.map((p) => {
                  const answer = g.answers[p.id]?.[ci] ?? "";
                  const pts = scores[p.id]?.[ci] ?? 0;
                  const key = voteKey(p.id, ci);
                  const votes = g.votes[key] ?? [];
                  const mineVote = !!stop.me && votes.includes(stop.me);
                  const usable = normalize(answer) !== "" && startsWith(answer, g.letter);
                  const ok = usable && approved(g, p.id, ci);
                  const canVote = stop.playing && p.id !== stop.me && usable;
                  return (
                    <td key={p.id} className={`pts-${pts} ${ok ? "ok" : usable ? "pending" : "out"}`}>
                      <button
                        type="button"
                        className="st-cell"
                        disabled={!canVote}
                        aria-pressed={mineVote}
                        data-tip={canVote ? (mineVote ? "Tirar a sua marca" : "Marcar como válida") : undefined}
                        onClick={() => stop.vote(p.id, ci, !mineVote)}
                      >
                        <span className="st-ans">{answer || "—"}</span>
                        <span className="st-pts num">{pts}</span>
                        {usable && <span className="st-votes xs">✓ {votes.length}/{Math.max(1, Math.ceil((active.length - 1) / 2))}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="st-total">
              <th scope="row">Na rodada</th>
              {active.map((p) => (
                <td key={p.id} className="num">
                  +{(scores[p.id] ?? []).reduce((a, b) => a + b, 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        {stop.isHost ? (
          <Button variant="primary" onClick={stop.next}>
            {g.round >= g.settings.rounds ? "Ver o resultado" : "Próxima rodada"}
          </Button>
        ) : (
          <span className="sm muted">Esperando {hostName} passar para a próxima.</span>
        )}
      </div>
    </div>
  );
}
