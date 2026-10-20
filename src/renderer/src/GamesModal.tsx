import { useState, type ReactNode } from "react";
import { CircleAlert, CircleDot, Pencil, ScanFace, Ship } from "lucide-react";
import type { DrawSettings } from "./drawGame";
import { lastDrawSettings, saveDrawSettings } from "./DrawGameView";
import type { DuelKind } from "./duelRules";
import type { VoiceParticipant } from "./useVoiceRoom";
import { Button } from "./components/Button";
import { Modal } from "./components/Modal";
import { Select } from "./components/Select";

type GameId = "draw" | DuelKind;

interface GameInfo {
  id: GameId;
  name: string;
  icon: ReactNode;
  players: string;
  text: string;
}

const GAMES: GameInfo[] = [
  {
    id: "lig4",
    name: "Lig 4",
    icon: <CircleDot size={22} />,
    players: "2 jogadores",
    text: "Soltem as peças por vez: quem fizer uma linha de 4 primeiro, na horizontal, vertical ou diagonal, ganha.",
  },
  {
    id: "naval",
    name: "Batalha Naval",
    icon: <Ship size={22} />,
    players: "2 jogadores",
    text: "Cada um esconde 5 navios e vocês trocam tiros. Quem afundar a frota inteira do outro primeiro ganha.",
  },
  {
    id: "cara",
    name: "Cara a Cara",
    icon: <ScanFace size={22} />,
    players: "2 jogadores",
    text: "Cada um tem um bichinho secreto. Por vez, perguntem em voz alta coisas de sim ou não e vão baixando as cartas. Quem chutar certo primeiro ganha.",
  },
  {
    id: "draw",
    name: "Desenha e Adivinha",
    icon: <Pencil size={22} />,
    players: "2 ou mais",
    text: "Cada um desenha uma palavra na sua vez e o resto chuta digitando. Quanto mais rápido acertar, mais pontos.",
  },
];

const ROUND_OPTIONS = ["2", "3", "4", "5"].map((v) => ({ value: v, label: `${v} rodadas` }));
const TIME_OPTIONS = ["60", "80", "100", "120"].map((v) => ({ value: v, label: `${v} segundos` }));
const GAME_KEY = "toca.jogos.ultimo";

const loadGame = (): GameId => {
  try {
    const id = localStorage.getItem(GAME_KEY);
    return GAMES.some((g) => g.id === id) ? (id as GameId) : GAMES[0].id;
  } catch {
    return GAMES[0].id;
  }
};

/** Escolher o jogo, as regras e (nos de 2) contra quem */
export function GamesModal({
  people,
  onStartDraw,
  onStartDuel,
  onClose,
}: {
  people: VoiceParticipant[];
  onStartDraw: (s: DrawSettings) => void;
  /** players[0] começa jogando */
  onStartDuel: (kind: DuelKind, players: [string, string]) => void;
  onClose: () => void;
}) {
  const [game, setGame] = useState<GameId>(loadGame);
  const [settings, setSettings] = useState(lastDrawSettings);
  const me = people.find((p) => p.isLocal);
  const others = people.filter((p) => !p.isLocal);
  const [opponent, setOpponent] = useState(others[0]?.identity ?? "");
  const rival = others.find((p) => p.identity === opponent) ?? others[0];
  const alone = others.length === 0;

  const start = () => {
    try {
      localStorage.setItem(GAME_KEY, game);
    } catch {
      // só nesta sessão
    }
    if (game === "draw") {
      saveDrawSettings(settings);
      onStartDraw(settings);
    } else if (me && rival) {
      // Quem começa: no sorteio
      const pair: [string, string] = Math.random() < 0.5 ? [me.identity, rival.identity] : [rival.identity, me.identity];
      onStartDuel(game, pair);
    }
  };

  return (
    <Modal
      title="Jogos"
      description="Para jogar com quem está na chamada."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={alone} onClick={start}>
            Começar
          </Button>
        </>
      }
    >
      <div className="games" role="radiogroup" aria-label="Jogo">
        {GAMES.map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={game === g.id} className="dg-card" onClick={() => setGame(g.id)}>
            <span className="dg-card-ico" aria-hidden="true">
              {g.icon}
            </span>
            <span className="grow">
              <span className="row" style={{ gap: 8 }}>
                <strong>{g.name}</strong>
                <span className="badge">{g.players}</span>
              </span>
              <span className="sm muted dg-card-text">{g.text}</span>
            </span>
          </button>
        ))}
      </div>

      {game === "draw" ? (
        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <Select label="Rodadas" value={String(settings.rounds)} options={ROUND_OPTIONS} onChange={(v) => setSettings((s) => ({ ...s, rounds: Number(v) }))} />
          </div>
          <div className="grow">
            <Select label="Tempo para desenhar" value={String(settings.seconds)} options={TIME_OPTIONS} onChange={(v) => setSettings((s) => ({ ...s, seconds: Number(v) }))} />
          </div>
        </div>
      ) : others.length > 1 ? (
        <Select
          label="Contra quem"
          hint="Quem não estiver jogando assiste. Quem começa sai no sorteio."
          value={rival?.identity ?? ""}
          options={others.map((p) => ({ value: p.identity, label: p.name }))}
          onChange={setOpponent}
        />
      ) : rival ? (
        <p className="sm muted">
          Você contra <b>{rival.name}</b>. Quem começa sai no sorteio.
        </p>
      ) : null}

      {alone && (
        <div className="notice info" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          Precisa de pelo menos 2 pessoas na chamada.
        </div>
      )}
    </Modal>
  );
}
