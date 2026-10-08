// Publica o instalador já gerado em dist/ no GitHub Releases do toca-releases.
//
// Substitui o "--publish always" do electron-builder, que no 26.x tem uma
// condição de corrida: envia os arquivos em paralelo e tenta criar o release
// duas vezes (erro 422 e release sem latest.yml).
//
// Fluxo: cria o release como rascunho (ou reaproveita o existente), envia os
// arquivos um por vez substituindo os de mesmo nome e só então publica. Assim
// os apps instalados nunca veem um release pela metade.
//
// Uso: node scripts/publish-github.mjs   (precisa do GH_TOKEN no ambiente)

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const OWNER = "tonyalbert";
const REPO = "toca-releases";

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${version}`;
const token = process.env.GH_TOKEN?.trim();
if (!token) fail("GH_TOKEN não definido. Abra um terminal novo depois do setx.");

const exe = `dist/Toca-Setup-${version}.exe`;
const files = [exe, `${exe}.blockmap`, "dist/latest.yml"];
for (const f of files) {
  if (!existsSync(f)) fail(`Arquivo não encontrado: ${f}. Rode "npm run dist" antes.`);
}

// latest.yml precisa descrever exatamente este .exe, senão a atualização falha
// na verificação de integridade nos apps instalados.
const latest = readFileSync("dist/latest.yml", "utf8");
const exeSha512 = createHash("sha512").update(readFileSync(exe)).digest("base64");
const ymlVersion = latest.match(/^version:\s*(.+)$/m)?.[1].trim();
const ymlSha512 = latest.match(/^sha512:\s*(.+)$/m)?.[1].trim();
if (ymlVersion !== version) fail(`latest.yml é da versão ${ymlVersion}, mas o package.json está em ${version}.`);
if (ymlSha512 !== exeSha512) fail("latest.yml não corresponde ao .exe em dist/. Rode \"npm run dist\" de novo.");

async function github(path, init = {}) {
  const url = path.startsWith("https://") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    fail(`GitHub ${init.method ?? "GET"} ${path} → ${res.status}\n${body}`);
  }
  return res.status === 204 ? null : res.json();
}

// /releases/tags/{tag} não encontra rascunhos, por isso a lista completa
const releases = await github(`/repos/${OWNER}/${REPO}/releases?per_page=100`);
let release = releases.find((r) => r.tag_name === tag);

if (release) {
  console.log(`• release ${tag} já existe (${release.draft ? "rascunho" : "publicado"}), completando`);
} else {
  console.log(`• criando release ${tag} como rascunho`);
  release = await github(`/repos/${OWNER}/${REPO}/releases`, {
    method: "POST",
    body: JSON.stringify({ tag_name: tag, name: version, draft: true }),
  });
}

for (const file of files) {
  const name = basename(file);
  const existing = release.assets.find((a) => a.name === name);
  if (existing) {
    console.log(`• substituindo ${name}`);
    await github(`/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, { method: "DELETE" });
  }
  const data = readFileSync(file);
  console.log(`• enviando ${name} (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
  await github(
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: data,
    },
  );
}

if (release.draft) {
  console.log(`• publicando ${tag}`);
  release = await github(`/repos/${OWNER}/${REPO}/releases/${release.id}`, {
    method: "PATCH",
    body: JSON.stringify({ draft: false, make_latest: "true" }),
  });
}

console.log(`\n✔ ${tag} publicado: ${release.html_url}`);
