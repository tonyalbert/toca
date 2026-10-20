import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CircleAlert, RotateCw, Shuffle, Square, Trophy } from "lucide-react";
import type { Duel, Seat } from "./duel";
import {
  DUEL_NAMES,
  DUEL_RULES,
  LIG4_COLS,
  LIG4_ROWS,
  NAVAL_SIZE,
  CARA_COUNT,
  caraCards,
  lig4Landing,
  randomFleet,
  shipCells,
  shipFits,
  type CaraState,
  type Lig4State,
  type NavalState,
  type Ship,
} from "./duelRules";
import type { VoiceParticipant } from "./useVoiceRoom";
import type { Look } from "./components/Avatar";
import { Avatar } from "./components/Avatar";
import { Button, IconButton } from "./components/Button";

/** A cor de cada lugar (Lig 4 e marcadores) */
const SEAT_CLASS = ["s0", "s1"] as const;

/** Moldura dos jogos de 2: quem joga, de quem é a vez, o resultado e a revanche */
export function DuelView({ duel, people, avatars }: { duel: Duel; people: VoiceParticipant[]; avatars: Map<string, Look> }) {
  const session = duel.session!;
  const rules = DUEL_RULES[session.kind];
  const result = rules.result(duel.state);
  const present = new Set(people.map((p) => p.identity));
  const talking = new Set(people.filter((p) => p.isSpeaking).map((p) => p.identity));
  const away = session.players.filter((id) => !present.has(id));
  const nameOf = (seat: Seat) => (seat === duel.seat ? "Você" : session.names[seat]);

  const status = statusOf(duel, nameOf);
  const outcome =
    result === null
      ? null
      : result === "draw"
        ? "Empate!"
        : result === duel.seat
          ? "Você ganhou!"
          : duel.seat === null
            ? `${session.names[result]} ganhou!`
            : "Você perdeu!";

  return (
    <div className="duel">
      <div className="duel-top">
        {([0, 1] as Seat[]).map((seat) => {
          const id = session.players[seat];
          const look = avatars.get(id);
          const turn = result === null && turnOf(duel) === seat;
          return (
            <div key={seat} className={`duel-player ${SEAT_CLASS[seat]} ${turn ? "turn" : ""} ${result === seat ? "won" : ""} ${seat === 1 ? "right" : ""}`}>
              <Avatar kind={look?.avatar ?? "rabbit"} photo={look?.photo} size={34} talking={talking.has(id)} />
              <span className="duel-name">
                {seat === duel.seat ? `${session.names[seat]} (você)` : session.names[seat]}
                {result === seat && <Trophy size={14} aria-label="Ganhou" />}
              </span>
              <span className="duel-dot" aria-hidden="true" />
            </div>
          );
        })}
        <div className="duel-mid">
          <span className="xs muted">{DUEL_NAMES[session.kind]}</span>
          <strong className={outcome ? "duel-outcome" : ""}>{outcome ?? status}</strong>
        </div>
        <IconButton size="sm" label="Encerrar a partida para todos" className="cine-end duel-end" onClick={duel.end}>
          <Square size={14} aria-hidden="true" />
        </IconButton>
      </div>

      {away.length > 0 && result === null && (
        <p className="cine-warn xs duel-warn" role="status">
          <CircleAlert size={13} aria-hidden="true" />
          {session.names[session.players.indexOf(away[0]) as Seat]} saiu da chamada. A partida continua quando voltar.
        </p>
      )}

      <div className="duel-stage">
        {session.kind === "lig4" && <Lig4Board duel={duel} />}
        {session.kind === "naval" && <NavalBoard duel={duel} />}
        {session.kind === "cara" && <CaraBoard duel={duel} />}
      </div>

      {result !== null && (
        <div className="duel-foot">
          <Button variant="ghost" onClick={duel.end}>
            Fechar
          </Button>
          {duel.seat !== null && (
            <Button variant="primary" onClick={duel.rematch}>
              Revanche
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** De quem é a vez (null: ninguém em especial) */
const turnOf = (duel: Duel): Seat | null => DUEL_RULES[duel.session!.kind].turn(duel.state);

function statusOf(duel: Duel, nameOf: (seat: Seat) => string): ReactNode {
  if (duel.session!.kind === "naval") {
    const s = duel.state as NavalState;
    if (duel.seat !== null && !s.ready[duel.seat]) return "Posicione seus navios";
    const waiting = ([0, 1] as Seat[]).find((seat) => !s.ready[seat]);
    if (waiting !== undefined) return `Esperando ${nameOf(waiting)} posicionar os navios…`;
    if (s.pending) return s.turn === duel.seat ? "Atirando…" : `${nameOf(s.turn)} atirou!`;
  }
  if (duel.session!.kind === "cara" && (duel.state as CaraState).guess) return `${nameOf((duel.state as CaraState).guess!.by)} chutou!`;
  const turn = turnOf(duel);
  if (turn === null) return "";
  const verb = { lig4: "", naval: " de atirar", cara: " de perguntar" }[duel.session!.kind];
  if (turn === duel.seat) return `Sua vez${verb}`;
  return `Vez de ${nameOf(turn)}${verb.replace(" de ", " ")}`;
}

// ---------- Lig 4 ----------

function Lig4Board({ duel }: { duel: Duel }) {
  const s = duel.state as Lig4State;
  const myTurn = duel.seat !== null && s.turn === duel.seat && s.winner === null && !s.draw;
  const [hover, setHover] = useState<number | null>(null);

  // Teclas 1 a 7 soltam a peça na coluna
  useEffect(() => {
    if (!myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const col = Number(e.key) - 1;
      if (Number.isInteger(col) && col >= 0 && col < LIG4_COLS) duel.play({ k: "drop", col });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [myTurn, duel.version]);

  const ghost = myTurn && hover !== null ? lig4Landing(s.board, hover) : null;
  const win = new Set(s.line);

  return (
    <div className={`l4 ${myTurn ? "my-turn" : ""}`} onMouseLeave={() => setHover(null)}>
      <div className="l4-grid" role="grid" aria-label="Tabuleiro do Lig 4">
        {s.board.map((cell, i) => {
          const col = i % LIG4_COLS;
          const row = Math.floor(i / LIG4_COLS);
          const piece = cell === -1 ? (i === ghost ? `ghost ${SEAT_CLASS[duel.seat!]}` : "") : SEAT_CLASS[cell];
          return (
            <button
              key={i}
              type="button"
              className={`l4-cell ${hover === col && myTurn ? "col-hover" : ""}`}
              aria-label={`Coluna ${col + 1}, linha ${LIG4_ROWS - row}${cell === -1 ? "" : cell === duel.seat ? ": sua peça" : ": peça do outro"}`}
              disabled={!myTurn}
              onMouseEnter={() => setHover(col)}
              onClick={() => duel.play({ k: "drop", col })}
            >
              {piece && (
                <span
                  className={`l4-piece ${piece} ${win.has(i) ? "l4-won" : ""} ${i === s.last ? "last" : ""}`}
                  style={i === s.last ? ({ "--drop": row + 1 } as React.CSSProperties) : undefined}
                />
              )}
            </button>
          );
        })}
      </div>
      {myTurn && <span className="xs muted l4-tip">Clique numa coluna (ou aperte 1 a 7)</span>}
    </div>
  );
}

// ---------- Cara a Cara ----------

function CaraBoard({ duel }: { duel: Duel }) {
  const s = duel.state as CaraState;
  const session = duel.session!;
  const seat = duel.seat;
  const cards = useMemo(() => caraCards(session.seed), [session.seed]);
  const mine = typeof duel.secret === "number" ? duel.secret : null;
  // Cartas que você baixou (só aqui, para você ir eliminando)
  const down = new Set((duel.scratch as number[] | null) ?? []);
  const [guessing, setGuessing] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const over = s.winner !== null;
  const myTurn = seat !== null && s.turn === seat && !over && !s.guess;

  // Saiu da sua vez (ou acabou): sai do modo de chute
  useEffect(() => {
    if (!myTurn) {
      setGuessing(false);
      setPick(null);
    }
  }, [myTurn]);

  const toggle = (i: number) => {
    if (guessing) return setPick(i);
    if (seat === null || over) return;
    const next = new Set(down);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    duel.setScratch([...next]);
  };

  const who = (x: Seat) => (x === seat ? "Você" : session.names[x]);
  const left = CARA_COUNT - down.size;

  return (
    <div className="cc">
      <div className={`cc-grid ${guessing ? "guessing" : ""}`} role="grid" aria-label="Bichinhos">
        {cards.map((c, i) => {
          const isDown = down.has(i) && !guessing;
          const mark = over && (s.secrets[0] === i || s.secrets[1] === i);
          return (
            <button
              key={i}
              type="button"
              className={`cc-card ${isDown ? "down" : ""} ${pick === i ? "picked" : ""} ${mark ? "secret" : ""} ${over && s.guess?.card === i ? "guessed" : ""}`}
              aria-pressed={isDown}
              aria-label={`${c.name}${isDown ? " (baixado)" : ""}`}
              disabled={seat === null || over || (guessing && down.has(i))}
              onClick={() => toggle(i)}
            >
              <span className="cc-art">
                <Avatar kind={c.avatar} size={96} />
              </span>
              <span className="cc-name">{c.name}</span>
            </button>
          );
        })}
      </div>

      <aside className="cc-side">
        {seat !== null && mine !== null && (
          <div className="cc-mine">
            <span className="xs muted">Seu bichinho (só você vê)</span>
            <span className="cc-art">
              <Avatar kind={cards[mine].avatar} size={96} />
            </span>
            <strong>{cards[mine].name}</strong>
          </div>
        )}

        {over ? (
          <div className="cc-end sm">
            {s.guess && (
              <p>
                {who(s.guess.by)} chutou <b>{cards[s.guess.card].name}</b>: {s.right ? "acertou!" : "errou."}
              </p>
            )}
            {([0, 1] as Seat[]).map((x) =>
              x === seat ? null : (
                <p key={x}>
                  O bichinho de {session.names[x]} era <b>{s.secrets[x] === null ? "…" : cards[s.secrets[x]!].name}</b>
                </p>
              ),
            )}
          </div>
        ) : seat === null ? (
          <p className="sm muted">Cada um tem um bichinho secreto. Na sua vez, pergunta algo em voz alta que dê para responder com sim ou não.</p>
        ) : s.guess ? (
          <p className="sm muted">{s.guess.by === seat ? `Você chutou ${cards[s.guess.card].name}…` : `${session.names[s.guess.by]} chutou ${cards[s.guess.card].name}…`}</p>
        ) : myTurn ? (
          guessing ? (
            <>
              <p className="sm">{pick === null ? "Clique no bichinho que você acha que é. Se errar, perde!" : <>Chutar que é <b>{cards[pick].name}</b>?</>}</p>
              <div className="row" style={{ gap: 8 }}>
                <Button variant="ghost" onClick={() => (setGuessing(false), setPick(null))}>
                  Cancelar
                </Button>
                <Button variant="primary" disabled={pick === null} onClick={() => pick !== null && duel.play({ k: "guess", card: pick })}>
                  Chutar
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="sm">
                Pergunte algo em voz alta que dê para responder com <b>sim</b> ou <b>não</b> (“tem óculos?”, “é gato?”). Clique nas cartas
                para baixar quem não é.
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Button onClick={() => duel.play({ k: "pass" })}>Passar a vez</Button>
                <Button variant="primary" onClick={() => setGuessing(true)}>
                  Chutar
                </Button>
              </div>
            </>
          )
        ) : (
          <p className="sm muted">
            {session.names[s.turn]} está perguntando. Responda em voz alta olhando o seu bichinho. Pode ir baixando as cartas.
          </p>
        )}

        {seat !== null && !over && (
          <span className="xs muted">
            {left === 1 ? "Sobrou 1 bichinho" : `Sobraram ${left} bichinhos`}
            {down.size > 0 && (
              <>
                {" · "}
                <button type="button" className="link" onClick={() => duel.setScratch([])}>
                  levantar todos
                </button>
              </>
            )}
          </span>
        )}
      </aside>
    </div>
  );
}

// ---------- Batalha Naval ----------

const LETTERS = "ABCDEFGHIJ";
const coord = (x: number, y: number) => `${LETTERS[x]}${y + 1}`;

/** Como cada casa aparece num mar */
interface SeaCell {
  ship?: { start: boolean; end: boolean; h: boolean };
  shot?: "hit" | "miss" | "sunk";
  last?: boolean;
  ghost?: "ok" | "bad";
}

function Sea({
  label,
  cells,
  active,
  onCell,
  onHover,
  onRotate,
}: {
  label: string;
  cells: SeaCell[];
  /** Dá para clicar (sua vez de atirar, ou posicionando) */
  active: boolean;
  onCell?: (x: number, y: number) => void;
  onHover?: (x: number, y: number) => void;
  /** Botão direito (posicionando: gira o navio) */
  onRotate?: () => void;
}) {
  return (
    <div className="nv-sea">
      <span className="nv-label sm">{label}</span>
      <div
        className={`nv-grid ${active ? "active" : ""}`}
        role="grid"
        aria-label={label}
        onContextMenu={(e) => {
          if (!onRotate) return;
          e.preventDefault();
          onRotate();
        }}
      >
        <span />
        {Array.from(LETTERS).map((l) => (
          <span key={l} className="nv-head">
            {l}
          </span>
        ))}
        {Array.from({ length: NAVAL_SIZE }, (_, y) => [
          <span key={`r${y}`} className="nv-head">
            {y + 1}
          </span>,
          ...Array.from({ length: NAVAL_SIZE }, (_, x) => {
            const c = cells[y * NAVAL_SIZE + x];
            const cls = [
              "nv-cell",
              c.ship && "ship",
              c.ship?.start && (c.ship.h ? "nv-sl" : "nv-st"),
              c.ship?.end && (c.ship.h ? "nv-sr" : "nv-sb"),
              c.shot,
              c.last && "last",
              c.ghost && `ghost-${c.ghost}`,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={`${x},${y}`}
                type="button"
                className={cls}
                aria-label={`${coord(x, y)}${c.shot === "miss" ? ": água" : c.shot ? ": acertado" : c.ship ? ": navio" : ""}`}
                disabled={!onCell}
                onClick={() => onCell?.(x, y)}
                onMouseEnter={() => onHover?.(x, y)}
              />
            );
          }),
        ])}
      </div>
    </div>
  );
}

/** As casas de um mar: navios (os seus, os afundados ou, no fim, todos) e tiros */
function seaCells(ships: Ship[], shots: { x: number; y: number; hit: boolean }[], sunk: Ship[], last: { x: number; y: number } | null): SeaCell[] {
  const cells: SeaCell[] = Array.from({ length: NAVAL_SIZE * NAVAL_SIZE }, () => ({}));
  for (const ship of ships)
    shipCells(ship).forEach(([x, y], i) => {
      cells[y * NAVAL_SIZE + x].ship = { start: i === 0, end: i === ship.len - 1, h: ship.h };
    });
  const sunkCells = new Set(sunk.flatMap((s) => shipCells(s).map(([x, y]) => y * NAVAL_SIZE + x)));
  for (const sh of shots) cells[sh.y * NAVAL_SIZE + sh.x].shot = !sh.hit ? "miss" : sunkCells.has(sh.y * NAVAL_SIZE + sh.x) ? "sunk" : "hit";
  if (last) cells[last.y * NAVAL_SIZE + last.x].last = true;
  return cells;
}

function NavalBoard({ duel }: { duel: Duel }) {
  const s = duel.state as NavalState;
  const session = duel.session!;
  const seat = duel.seat;
  const fleet = (duel.secret as Ship[] | null) ?? [];

  if (seat !== null && !s.ready[seat]) {
    return <NavalPlacement fleet={fleet} onChange={duel.setSecret} onReady={() => duel.play({ k: "ready" })} />;
  }

  const target = seat === null ? null : ((1 - seat) as Seat);
  const myTurn = seat !== null && s.turn === seat && s.ready[0] && s.ready[1] && s.winner === null && !s.pending;
  // Navios à mostra no mar de cada um: os seus, os afundados e, no fim, todos
  const shipsOf = (x: Seat) => (x === seat ? fleet : (s.fleets[x] ?? s.seas[x].sunk));
  const who = (x: Seat) => (x === seat ? "Você" : session.names[x]);

  const lastText = s.last
    ? `${who(s.last.by)} atirou em ${coord(s.last.x, s.last.y)}: ${s.last.sunk ? `afundou o ${s.last.sunk}!` : s.last.hit ? "acertou!" : "água."}`
    : s.ready[0] && s.ready[1]
      ? `${who(s.turn)} ${s.turn === seat ? "começa" : "começa atirando"}.`
      : "";

  // Quem joga: o seu mar e o do outro. Quem assiste: os dois
  const seas: Seat[] = seat === null ? [0, 1] : [seat, target!];
  return (
    <div className="nv">
      <div className="nv-seas">
        {seas.map((x) => {
          const sea = s.seas[x];
          const canShoot = myTurn && x === target;
          return (
            <Sea
              key={x}
              label={x === seat ? "Sua frota" : canShoot ? `Mar de ${session.names[x]}: atire aqui` : `Frota de ${session.names[x]}`}
              cells={seaCells(shipsOf(x), sea.shots, sea.sunk, s.last && s.last.by !== x ? s.last : null)}
              active={canShoot}
              onCell={canShoot ? (cx, cy) => duel.play({ k: "shot", x: cx, y: cy }) : undefined}
            />
          );
        })}
      </div>
      <p className={`nv-last sm ${s.last?.hit ? "hit" : ""}`} role="status">
        {lastText}
      </p>
    </div>
  );
}

/** Posicionar a frota: clique num navio para pegar e clique onde quer soltar; R ou botão direito gira */
function NavalPlacement({ fleet, onChange, onReady }: { fleet: Ship[]; onChange: (f: Ship[]) => void; onReady: () => void }) {
  const [holding, setHolding] = useState<{ ship: Ship; rest: Ship[] } | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);

  const rotate = () => setHolding((h) => h && { ...h, ship: { ...h.ship, h: !h.ship.h } });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "Escape" && holding) {
        e.preventDefault();
        setHolding(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [holding]);

  const ghost = holding && hover ? { ...holding.ship, x: hover[0], y: hover[1] } : null;
  const ghostOk = !!ghost && !!holding && shipFits(ghost, holding.rest);
  const cells = seaCells(holding ? holding.rest : fleet, [], [], null);
  if (ghost)
    for (const [x, y] of shipCells(ghost)) if (x < NAVAL_SIZE && y < NAVAL_SIZE) cells[y * NAVAL_SIZE + x].ghost = ghostOk ? "ok" : "bad";

  const click = (x: number, y: number) => {
    if (holding) {
      const placed = { ...holding.ship, x, y };
      if (!shipFits(placed, holding.rest)) return;
      onChange([...holding.rest, placed]);
      setHolding(null);
      return;
    }
    const ship = fleet.find((sh) => shipCells(sh).some(([cx, cy]) => cx === x && cy === y));
    if (!ship) return;
    // Pega pela ponta do navio: ele segue o mouse a partir dali
    setHolding({ ship, rest: fleet.filter((sh) => sh !== ship) });
    setHover([ship.x, ship.y]);
  };

  return (
    <div className="nv nv-place">
      <Sea label="Sua frota" cells={cells} active onCell={click} onHover={(x, y) => setHover([x, y])} onRotate={rotate} />
      <div className="nv-side">
        <strong>Posicione seus navios</strong>
        <p className="sm muted">
          Clique num navio para pegar e clique onde quer soltar. Para girar, aperte <b>R</b> ou o botão direito. Um navio não pode
          encostar no outro.
        </p>
        <ul className="nv-fleet sm">
          {fleet.map((sh) => (
            <li key={sh.name}>
              <span className="nv-pips" aria-hidden="true">
                {Array.from({ length: sh.len }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              {sh.name}
            </li>
          ))}
        </ul>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Button
            icon={<Shuffle size={16} aria-hidden="true" />}
            onClick={() => {
              setHolding(null);
              onChange(randomFleet());
            }}
          >
            Sortear
          </Button>
          {holding && (
            <Button icon={<RotateCw size={16} aria-hidden="true" />} onClick={rotate}>
              Girar
            </Button>
          )}
          <Button variant="primary" icon={<Check size={16} aria-hidden="true" />} disabled={!!holding || fleet.length === 0} onClick={onReady}>
            Pronto!
          </Button>
        </div>
      </div>
    </div>
  );
}
