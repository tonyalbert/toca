// Sensibilidade automática do microfone: simula ambientes e confere quando o microfone abre.
// node --test scripts/test-auto-gate.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { AutoGate } from "../src/renderer/src/autoGate.ts";

let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = () => (random() - 0.5) * 4;
const noise = (base: number) => () => base + jitter();
/** Fala: sílabas de ~190 ms, pausas curtas e uma respiração a cada ~2 s */
const speech = (loud: number, bg: number) => {
  let t = 0;
  return () => {
    t += 20;
    const cycle = t % 2200;
    if (cycle > 1900) return bg + jitter();
    return (cycle % 280 < 190 ? loud : bg + 6) + jitter();
  };
};
const clicks = (bg: number) => {
  let t = 0;
  return () => ((t += 20) % 400 < 20 ? -35 : bg) + jitter();
};

/** Fração do tempo com o microfone aberto */
function run(gate: AutoGate, clock: { t: number }, seconds: number, level: () => number): number {
  let open = 0;
  for (let i = 0; i < seconds * 50; i++) if (gate.update(level(), (clock.t += 20))) open++;
  return open / (seconds * 50);
}

test("quarto quieto: fechado; fala (alta ou baixinha): aberto", () => {
  const g = new AutoGate();
  const c = { t: 0 };
  assert.equal(run(g, c, 5, noise(-62)), 0);
  assert.ok(run(g, c, 4, speech(-25, -62)) > 0.95);
  run(g, c, 2, noise(-62));
  assert.ok(run(g, c, 4, speech(-42, -62)) > 0.95);
});

test("ventilador ligado: em poucos segundos vira fundo e fecha; a fala por cima abre", () => {
  const g = new AutoGate();
  const c = { t: 0 };
  run(g, c, 5, noise(-62));
  run(g, c, 4, noise(-45)); // aprendendo o ventilador (a janela é de 3 s)
  assert.equal(run(g, c, 5, noise(-45)), 0);
  assert.ok(run(g, c, 4, speech(-27, -45)) > 0.95);
});

test("fala longa sem parar não acaba cortada", () => {
  const g = new AutoGate();
  const c = { t: 0 };
  run(g, c, 5, noise(-45));
  assert.ok(run(g, c, 20, speech(-27, -45)) > 0.95);
});

test("cliques de teclado quase não abrem", () => {
  const g = new AutoGate();
  const c = { t: 0 };
  run(g, c, 5, noise(-62));
  assert.ok(run(g, c, 4, clicks(-62)) < 0.2);
});
