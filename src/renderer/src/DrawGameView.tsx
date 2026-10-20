import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Brush, Check, CircleAlert, Clock, Crown, Eraser, PaintBucket, Pencil, Send, Square, Trash2, Undo2 } from "lucide-react";
import { BOARD_H, BOARD_W, DEFAULT_SETTINGS, remaining, type DrawGame, type DrawSettings, type LineOp, type Op } from "./drawGame";
import type { VoiceParticipant } from "./useVoiceRoom";
import type { Look } from "./components/Avatar";
import { Avatar } from "./components/Avatar";
import { Button, IconButton } from "./components/Button";
import { Modal } from "./components/Modal";
import { Select } from "./components/Select";

// ---------- pintura (igual em todos os PCs: o quadro tem tamanho fixo) ----------

const WHITE = "#ffffff";

function drawLine(ctx: CanvasRenderingContext2D, op: LineOp, from = 0) {
  const p = op.p;
  ctx.strokeStyle = op.c;
  ctx.fillStyle = op.c;
  ctx.lineWidth = op.w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], op.w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const start = Math.max(0, from - 2);
  ctx.beginPath();
  ctx.moveTo(p[start], p[start + 1]);
  for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.stroke();
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Balde: pinta a área da mesma cor (e 1 px da borda, para não sobrar contorno claro) */
function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string) {
  const img = ctx.getImageData(0, 0, BOARD_W, BOARD_H);
  const d = img.data;
  const [r, g, b] = rgb(hex);
  const start = Math.round(y) * BOARD_W + Math.round(x);
  if (start < 0 || start >= BOARD_W * BOARD_H) return;
  const tr = d[start * 4];
  const tg = d[start * 4 + 1];
  const tb = d[start * 4 + 2];
  if (Math.abs(tr - r) + Math.abs(tg - g) + Math.abs(tb - b) < 6) return;
  const match = (q: number) => Math.abs(d[q * 4] - tr) + Math.abs(d[q * 4 + 1] - tg) + Math.abs(d[q * 4 + 2] - tb) <= 110;
  const seen = new Uint8Array(BOARD_W * BOARD_H);
  const edge: number[] = [];
  const stack = [start];
  seen[start] = 1;
  const visit = (q: number) => {
    if (seen[q]) return;
    seen[q] = 1;
    if (match(q)) stack.push(q);
    else edge.push(q);
  };
  while (stack.length) {
    const q = stack.pop()!;
    const px = q % BOARD_W;
    if (px > 0) visit(q - 1);
    if (px < BOARD_W - 1) visit(q + 1);
    if (q >= BOARD_W) visit(q - BOARD_W);
    if (q < BOARD_W * (BOARD_H - 1)) visit(q + BOARD_W);
    d[q * 4] = r;
    d[q * 4 + 1] = g;
    d[q * 4 + 2] = b;
    d[q * 4 + 3] = 255;
  }
  for (const q of edge) {
    d[q * 4] = r;
    d[q * 4 + 1] = g;
    d[q * 4 + 2] = b;
    d[q * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function paintOp(ctx: CanvasRenderingContext2D, op: Op) {
  if (op.k === "line") drawLine(ctx, op);
  else floodFill(ctx, op.x, op.y, op.c);
}

function paintAll(ctx: CanvasRenderingContext2D, ops: Op[]) {
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  for (const op of ops) paintOp(ctx, op);
}

// ---------- quadro ----------

const COLORS = [
  "#1f2430", "#7b8494", "#ffffff", "#8b2c2c", "#e53935", "#fb8c00", "#fdd835", "#f5c9a0",
  "#795548", "#43a047", "#9ccc65", "#26a69a", "#4fc3f7", "#1e88e5", "#8e24aa", "#ec407a",
];
const SIZES = [4, 9, 18, 34];
type Tool = "pen" | "eraser" | "fill";

function Board({ draw, turnKey, canDraw, tool, color, size }: { draw: DrawGame; turnKey: string; canDraw: boolean; tool: Tool; color: string; size: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const drawing = useRef(false);

  // Maior 4:3 que cabe no espaço
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, (height * BOARD_W) / BOARD_H);
      setBox({ w: Math.floor(w), h: Math.floor((w * BOARD_H) / BOARD_W) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    paintAll(ctx, draw.visibleOps());
    return draw.onBoard((e) => {
      const ops = draw.visibleOps();
      if (e.kind === "reset") paintAll(ctx, ops);
      else if (!ops.includes(e.op)) return;
      else if (e.kind === "op") paintOp(ctx, e.op);
      else drawLine(ctx, e.op, e.from);
    });
  }, [draw.onBoard, turnKey]);

  const toBoard = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * BOARD_W);
    const y = Math.round(((e.clientY - r.top) / r.height) * BOARD_H);
    return [Math.min(BOARD_W - 1, Math.max(0, x)), Math.min(BOARD_H - 1, Math.max(0, y))];
  };

  return (
    <div className="dg-board" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        width={BOARD_W}
        height={BOARD_H}
        className={canDraw ? `can-draw tool-${tool}` : ""}
        style={box ? { width: box.w, height: box.h } : { visibility: "hidden" }}
        aria-label="Quadro de desenho"
        onPointerDown={(e) => {
          if (!canDraw || e.button !== 0) return;
          const [x, y] = toBoard(e);
          if (tool === "fill") return draw.draw.fill(color, x, y);
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          draw.draw.begin(tool === "eraser" ? WHITE : color, tool === "eraser" ? Math.max(size, 14) : size, x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          // Mouse rápido: o navegador junta vários pontos num evento só
          const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
          if (events.length > 1) {
            const r = canvasRef.current!.getBoundingClientRect();
            for (const ev of events) {
              const x = Math.round(((ev.clientX - r.left) / r.width) * BOARD_W);
              const y = Math.round(((ev.clientY - r.top) / r.height) * BOARD_H);
              draw.draw.move(Math.min(BOARD_W - 1, Math.max(0, x)), Math.min(BOARD_H - 1, Math.max(0, y)));
            }
          } else draw.draw.move(...toBoard(e));
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          draw.draw.end();
        }}
        onPointerCancel={() => {
          drawing.current = false;
          draw.draw.end();
        }}
      />
    </div>
  );
}

// ---------- tela do jogo ----------

function Hint({ text }: { text: string }) {
  return (
    <span className="dg-hint" aria-label={`Palavra com ${[...text].filter((c) => c !== " " && c !== "-").length} letras`}>
      {[...text].map((ch, i) => (
        <span key={i} className={ch === " " ? "sp" : ch === "_" ? "blank" : "ch"}>
          {ch === "_" ? "" : ch}
        </span>
      ))}
    </span>
  );
}

export function DrawGameView({
  draw,
  people,
  avatars,
  onPlayAgain,
}: {
  draw: DrawGame;
  people: VoiceParticipant[];
  avatars: Map<string, Look>;
  onPlayAgain: () => void;
}) {
  const game = draw.game!;
  const me = draw.me;
  const [, setTick] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(timer);
  }, []);

  const drawing = game.phase === "drawing";
  const iDraw = game.drawer === me;
  const canDraw = drawing && iDraw;
  const iGuessed = !!me && game.guessed.includes(me);
  const canGuess = drawing && !iDraw && !iGuessed;
  const present = new Set(people.map((p) => p.identity));
  const talking = new Set(people.filter((p) => p.isSpeaking).map((p) => p.identity));
  const nameOf = (id: string | null) => (id === me ? "Você" : (game.players.find((p) => p.id === id)?.name ?? "Alguém"));
  const secs = Math.ceil(remaining(game) / 1000);
  const total = game.phase === "drawing" ? game.settings.seconds : game.phase === "choosing" ? 15 : 6;

  // Vez de chutar: o cursor já vai para o campo
  useEffect(() => {
    if (canGuess) inputRef.current?.focus();
  }, [canGuess, game.turn]);

  // Feed sempre no fim
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [draw.feed.length]);

  // Ctrl+Z desfaz o último traço
  useEffect(() => {
    if (!canDraw) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        draw.draw.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canDraw]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    draw.guess(text);
    setText("");
  };

  const ranking = [...game.players].sort((a, b) => b.score - a.score);

  let top: React.ReactNode;
  if (game.phase === "choosing") top = <span className="dg-status">{iDraw ? "Escolha o que desenhar" : `${nameOf(game.drawer)} está escolhendo…`}</span>;
  else if (drawing && draw.word) top = (
    <span className="dg-status">
      {iDraw ? "Desenhe:" : "Você acertou:"} <b className="dg-word">{draw.word}</b>
    </span>
  );
  else if (drawing && game.hint) top = <Hint text={game.hint} />;
  else if (game.phase === "reveal") top = <span className="dg-status">{game.word ? <>A palavra era <b className="dg-word">{game.word}</b></> : "Vez pulada"}</span>;
  else top = <span className="dg-status">Fim de jogo</span>;

  return (
    <div className="dg">
      <div className="dg-main">
        <div className="dg-top">
          <span className="badge">
            {game.phase === "end" ? "Fim" : `Rodada ${game.round} de ${game.settings.rounds}`}
          </span>
          <div className="dg-center">{top}</div>
          {game.phase !== "end" && (
            <span className={`dg-timer num ${drawing && secs <= 10 ? "low" : ""}`} aria-label={`${secs} segundos`}>
              <Clock size={15} aria-hidden="true" />
              {secs}
              <span className="dg-timebar" style={{ "--t": Math.min(1, secs / total) } as React.CSSProperties} />
            </span>
          )}
          <IconButton size="sm" label="Encerrar o jogo para todos" className="cine-end" onClick={draw.end}>
            <Square size={14} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="dg-stage">
          <Board draw={draw} turnKey={`${game.id}:${game.turn}:${game.drawer}`} canDraw={canDraw} tool={tool} color={color} size={size} />

          {game.phase === "choosing" && (
            <div className="dg-over">
              {draw.options ? (
                <>
                  <strong>Sua vez! O que você vai desenhar?</strong>
                  <div className="dg-options">
                    {draw.options.map((w, i) => (
                      <Button key={w} size="lg" variant={i === 0 ? "primary" : "secondary"} onClick={() => draw.pick(i)}>
                        {w}
                      </Button>
                    ))}
                  </div>
                  <span className="sm muted">Sem escolher em {secs}s, vai uma delas no sorteio.</span>
                </>
              ) : (
                <>
                  <Pencil size={28} aria-hidden="true" />
                  <strong>{nameOf(game.drawer)} está escolhendo a palavra…</strong>
                </>
              )}
            </div>
          )}

          {game.phase === "reveal" && (
            <div className="dg-over">
              {game.word ? (
                <>
                  <span className="sm muted">A palavra era</span>
                  <strong className="dg-reveal">{game.word}</strong>
                  {Object.keys(game.gained).length === 0 ? (
                    <span className="sm muted">Ninguém acertou dessa vez.</span>
                  ) : (
                    <ul className="dg-gained">
                      {Object.entries(game.gained)
                        .sort((a, b) => b[1] - a[1])
                        .map(([id, pts]) => (
                          <li key={id}>
                            <span>{nameOf(id)}</span>
                            <b className="num">+{pts}</b>
                          </li>
                        ))}
                    </ul>
                  )}
                </>
              ) : (
                <strong>{game.turn === 0 ? "Começando…" : "Quem ia desenhar saiu. Próxima vez!"}</strong>
              )}
            </div>
          )}

          {game.phase === "end" && (
            <div className="dg-over">
              <Crown size={30} aria-hidden="true" className="dg-crown" />
              <strong className="dg-reveal">{ranking[0] ? `${nameOf(ranking[0].id)} ganhou!` : "Fim de jogo"}</strong>
              <ol className="dg-podium">
                {ranking.slice(0, 5).map((p, i) => (
                  <li key={p.id}>
                    <span className="pos num">{i + 1}º</span>
                    <span className="grow">{nameOf(p.id)}</span>
                    <b className="num">{p.score}</b>
                  </li>
                ))}
              </ol>
              <div className="row" style={{ gap: 8 }}>
                <Button variant="ghost" onClick={draw.end}>
                  Fechar
                </Button>
                <Button variant="primary" onClick={onPlayAgain}>
                  Jogar de novo
                </Button>
              </div>
            </div>
          )}
        </div>

        {canDraw && (
          <div className="dg-tools" role="toolbar" aria-label="Ferramentas de desenho">
            <div className="dg-colors" role="radiogroup" aria-label="Cor">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c && tool !== "eraser"}
                  aria-label={`Cor ${c}`}
                  className="dg-color"
                  style={{ background: c }}
                  onClick={() => {
                    setColor(c);
                    if (tool === "eraser") setTool("pen");
                  }}
                />
              ))}
            </div>
            <span className="sep" aria-hidden="true" />
            <div className="dg-sizes" role="radiogroup" aria-label="Espessura">
              {SIZES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={size === s} aria-label={`Espessura ${s}`} className="dg-size" onClick={() => setSize(s)}>
                  <span style={{ width: Math.max(4, s * 0.6), height: Math.max(4, s * 0.6) }} />
                </button>
              ))}
            </div>
            <span className="sep" aria-hidden="true" />
            <IconButton size="sm" label="Pincel" aria-pressed={tool === "pen"} className={tool === "pen" ? "on" : ""} onClick={() => setTool("pen")}>
              <Brush size={16} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" label="Borracha" aria-pressed={tool === "eraser"} className={tool === "eraser" ? "on" : ""} onClick={() => setTool("eraser")}>
              <Eraser size={16} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" label="Balde de tinta" aria-pressed={tool === "fill"} className={tool === "fill" ? "on" : ""} onClick={() => setTool("fill")}>
              <PaintBucket size={16} aria-hidden="true" />
            </IconButton>
            <span className="sep" aria-hidden="true" />
            <IconButton size="sm" label="Desfazer (Ctrl+Z)" onClick={draw.draw.undo}>
              <Undo2 size={16} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" label="Limpar o quadro" onClick={draw.draw.clear}>
              <Trash2 size={16} aria-hidden="true" />
            </IconButton>
          </div>
        )}
      </div>

      <aside className="dg-side" aria-label="Placar e chutes">
        <ol className="dg-players">
          {ranking.map((p) => {
            const look = avatars.get(p.id);
            const away = !present.has(p.id);
            return (
              <li key={p.id} className={`${away ? "away" : ""} ${p.id === me ? "me" : ""}`}>
                <Avatar kind={look?.avatar ?? "rabbit"} photo={look?.photo} size={30} talking={talking.has(p.id)} />
                <span className="grow dg-name">
                  {p.id === me ? `${p.name} (você)` : p.name}
                  {away && <span className="xs muted"> · saiu</span>}
                </span>
                {game.drawer === p.id && game.phase !== "end" && <Pencil size={15} aria-label="Desenhando" className="dg-mark draw" />}
                {game.guessed.includes(p.id) && <Check size={16} aria-label="Acertou" className="dg-mark hit" />}
                <b className="num dg-score">{p.score}</b>
              </li>
            );
          })}
        </ol>

        <ol className="dg-feed" ref={feedRef} aria-live="polite">
          {draw.feed.map((f) =>
            f.kind === "info" ? (
              <li key={f.key} className="info">
                {f.text}
              </li>
            ) : f.kind === "hit" ? (
              <li key={f.key} className="hit">
                <Check size={14} aria-hidden="true" /> {nameOf(f.by)} acertou!
              </li>
            ) : f.kind === "close" ? (
              <li key={f.key} className="close">
                <CircleAlert size={14} aria-hidden="true" /> “{f.text}” está quase!
              </li>
            ) : (
              <li key={f.key}>
                <b>{nameOf(f.by)}</b> {f.text}
              </li>
            ),
          )}
        </ol>

        <form className="dg-guess" onSubmit={submit}>
          <input
            ref={inputRef}
            className="input"
            value={text}
            maxLength={60}
            spellCheck={false}
            autoComplete="off"
            disabled={!canGuess}
            placeholder={
              iDraw && drawing ? "Você está desenhando" : iGuessed ? "Você acertou!" : drawing ? "Seu chute (não vale falar!)" : "Espere a próxima vez"
            }
            onChange={(e) => setText(e.target.value)}
            aria-label="Seu chute"
          />
          <IconButton label="Chutar" type="submit" solid disabled={!canGuess || !text.trim()}>
            <Send size={16} aria-hidden="true" />
          </IconButton>
        </form>
      </aside>
    </div>
  );
}

// ---------- começar ----------

const ROUND_OPTIONS = ["2", "3", "4", "5"].map((v) => ({ value: v, label: `${v} rodadas` }));
const TIME_OPTIONS = ["60", "80", "100", "120"].map((v) => ({ value: v, label: `${v} segundos` }));
const SETTINGS_KEY = "toca.desenho.settings";

const loadSettings = (): DrawSettings => {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as DrawSettings | null;
    return s && s.rounds >= 2 && s.rounds <= 5 && s.seconds >= 60 && s.seconds <= 120 ? s : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

/** As regras do último jogo (para "Jogar de novo") */
export const lastDrawSettings = loadSettings;

/** Escolher o jogo e as regras */
export function GamesModal({ players, onStart, onClose }: { players: number; onStart: (s: DrawSettings) => void; onClose: () => void }) {
  const [settings, setSettings] = useState(loadSettings);
  const alone = players < 2;

  const start = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // só nesta sessão
    }
    onStart(settings);
  };

  return (
    <Modal
      title="Jogos"
      description="Todo mundo da chamada joga junto."
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
      <div className="dg-card">
        <span className="dg-card-ico" aria-hidden="true">
          <Pencil size={22} />
        </span>
        <div className="grow">
          <strong>Desenha e Adivinha</strong>
          <p className="sm muted">
            Cada um desenha uma palavra na sua vez e o resto chuta digitando. Quanto mais rápido acertar, mais pontos. Quem
            desenha também ganha quando acertam.
          </p>
        </div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="grow">
          <Select label="Rodadas" value={String(settings.rounds)} options={ROUND_OPTIONS} onChange={(v) => setSettings((s) => ({ ...s, rounds: Number(v) }))} />
        </div>
        <div className="grow">
          <Select label="Tempo para desenhar" value={String(settings.seconds)} options={TIME_OPTIONS} onChange={(v) => setSettings((s) => ({ ...s, seconds: Number(v) }))} />
        </div>
      </div>
      {alone && (
        <div className="notice info" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          Precisa de pelo menos 2 pessoas na chamada.
        </div>
      )}
    </Modal>
  );
}
