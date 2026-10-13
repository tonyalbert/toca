/** Foto de perfil: o que vai para a API */

/** A foto parada sai quadrada, com este lado */
const SIDE = 256;
const MAX_GIF_BYTES = 4 * 1024 * 1024;

export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export interface PreparedPhoto {
  /** Quadrado de 256×256 em WebP (no GIF, o primeiro quadro) */
  still: Blob;
  /** O GIF original, que só se mexe quando a pessoa fala */
  gif: Blob | null;
}

/** Corta no centro em quadrado e reduz; GIF também leva o original junto */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem (PNG, JPEG, WebP ou GIF).");
  const isGif = file.type === "image/gif";
  if (isGif && file.size > MAX_GIF_BYTES) throw new Error("O GIF passa de 4 MB. Escolha um menor.");
  let bitmap: ImageBitmap;
  try {
    // No GIF, vem o primeiro quadro
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não deu para abrir essa imagem.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(SIDE, side);
  const canvas = new OffscreenCanvas(out, out);
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const still = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
  return { still, gif: isGif ? file : null };
}
