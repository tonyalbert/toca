// Gera os ícones do app a partir dos SVGs em design/icone:
//   build/icon.ico      instalador, atalhos e barra de tarefas (16, 24, 32, 48, 256)
//   build/icon.png      janela (512)
//   build/tray.png      bandeja em 100% de escala (16) e tray@2x.png em 200% (32)
// O 16 px usa toca-icon-16px.svg, com o arco mais largo para continuar legível.
// Uso: node scripts/build-icons.mjs (rodar de novo só quando o ícone mudar)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = join(import.meta.dirname, "..");
const main = readFileSync(join(root, "design/icone/toca-icon.svg"), "utf8");
const small = readFileSync(join(root, "design/icone/toca-icon-16px.svg"), "utf8");

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

/** .ico com PNG dentro de cada entrada (aceito pelo Windows desde o Vista) */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // 1 = ícone
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // largura (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // altura
    e.writeUInt8(0, 2); // paleta
    e.writeUInt8(0, 3); // reservado
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [16, 24, 32, 48, 256];
const images = sizes.map((size) => ({ size, data: png(size === 16 ? small : main, size) }));

const out = (name, data) => {
  writeFileSync(join(root, "build", name), data);
  console.log(`build/${name} (${data.length} bytes)`);
};
out("icon.ico", ico(images));
out("icon.png", png(main, 512));
out("tray.png", png(small, 16));
out("tray@2x.png", png(main, 32));
