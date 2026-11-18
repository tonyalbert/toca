// Regras de pontos do Stop: npx tsx --test scripts/test-stop-rules.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { approved, roundScores, startsWith, voteKey, type StopState } from "../src/renderer/src/stopGame.ts";

const base = (answers: Record<string, string[]>, votes: Record<string, string[]> = {}, active = ["ana", "bia", "caio"]): StopState => ({
  id: "j", host: "ana", started: 0, rev: 1,
  settings: { rounds: 3, seconds: 60, categories: ["Nome", "Animal"] },
  players: ["ana", "bia", "caio", "duda"].map((id) => ({ id, name: id, score: 0, active: active.includes(id) })),
  round: 1, letter: "A", used: ["A"], phase: "review", stoppedBy: null, left: 0, answers, votes,
});

/** Todas as respostas marcadas como válidas por todos os outros ativos */
const allApproved = (answers: Record<string, string[]>, active = ["ana", "bia", "caio"]) => {
  const votes: Record<string, string[]> = {};
  for (const id of Object.keys(answers)) answers[id].forEach((_, c) => (votes[voteKey(id, c)] = active.filter((v) => v !== id)));
  return votes;
};

test("validadas: 10 só você, 5 repetida, 0 vazia ou outra letra", () => {
  const answers = { ana: ["Ana", "Arara"], bia: ["ana ", "Baleia"], caio: ["Álvaro", ""] };
  assert.deepEqual(roundScores(base(answers, allApproved(answers))), { ana: [5, 10], bia: [5, 0], caio: [10, 0] });
});

test("sem ninguém marcar como válida, não vale ponto", () => {
  const s = base({ ana: ["Ana", "Arara"], bia: ["Abacaxi", "Anta"], caio: ["Aline", "Asno"] });
  assert.deepEqual(roundScores(s), { ana: [0, 0], bia: [0, 0], caio: [0, 0] });
});

test("acento e maiúscula não importam na letra", () => {
  assert.equal(startsWith("Águia", "A"), true);
  assert.equal(startsWith("  ", "A"), false);
});

test("validada com metade ou mais dos outros jogadores ativos", () => {
  // 3 ativos: os outros 2 marcam; basta 1 (metade de 2)
  const s = base({ ana: ["Ana", "Arara"], bia: ["Abacaxi", "Anta"], caio: ["Aline", "Asno"] }, { [voteKey("bia", 0)]: ["ana"] });
  assert.equal(approved(s, "bia", 0), true);
  assert.equal(roundScores(s).bia[0], 10);
  assert.equal(roundScores(s).caio[0], 0);
});

test("quem saiu (inativo) não conta pontos nem faz a resposta repetir", () => {
  const answers = { ana: ["Ana", "Arara"], bia: ["Bia", "Arara"], duda: ["Ana", "Arara"] };
  const s = base(answers, allApproved(answers, ["ana", "bia"]), ["ana", "bia"]);
  const r = roundScores(s);
  assert.equal(r.duda, undefined);
  assert.deepEqual(r.ana, [10, 5]);
});
