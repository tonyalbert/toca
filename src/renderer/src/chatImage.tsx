import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ImageOff, X } from "lucide-react";
import { fetchMessageImage, MAX_IMAGE_BYTES, type ChatMessage } from "./api";

/** Lado maior de uma imagem enviada; maior que isso é reduzida */
const MAX_SIDE = 2560;
/** PNG/WebP/GIF até este tamanho vão como estão (prints ficam nítidos) */
const KEEP_BYTES = 1.5 * 1024 * 1024;

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/bmp";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Deixa a imagem pronta para enviar: GIF vai como está (para não perder a
 * animação); o resto é reduzido e vira WebP quando é grande. JPEG sempre é
 * refeito, o que também tira os metadados (local da foto, câmera).
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Só dá para anexar imagens.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não deu para abrir essa imagem.");
  }
  const { width, height } = bitmap;
  if (file.type === "image/gif") {
    bitmap.close();
    if (file.size > MAX_IMAGE_BYTES) throw new Error("O GIF passa de 5 MB.");
    return { blob: file, width, height };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (scale === 1 && (file.type === "image/png" || file.type === "image/webp") && file.size <= KEEP_BYTES) {
    bitmap.close();
    return { blob: file, width, height };
  }
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
  if (blob.size > MAX_IMAGE_BYTES) blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.7 });
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("A imagem é grande demais (mais de 5 MB).");
  return { blob, width: w, height: h };
}

export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).slice((reader.result as string).indexOf(",") + 1));
    reader.onerror = () => reject(new Error("Não deu para ler a imagem."));
    reader.readAsDataURL(blob);
  });
}

/** A primeira imagem de uma lista de arquivos (colar ou arrastar) */
export const firstImage = (files: FileList | null | undefined) => [...(files ?? [])].find((f) => f.type.startsWith("image/")) ?? null;

// Endereços (blob:) das imagens já baixadas, por mensagem: rolar a conversa não baixa de novo
const urls = new Map<string, Promise<string>>();

function imageUrl(messageId: string): Promise<string> {
  let url = urls.get(messageId);
  if (!url) {
    url = fetchMessageImage(messageId).then((blob) => URL.createObjectURL(blob));
    url.catch(() => urls.delete(messageId));
    urls.set(messageId, url);
  }
  return url;
}

/** Quem enviou já tem os bytes: mostra na hora, sem baixar */
export function rememberImage(messageId: string, blob: Blob): void {
  if (!urls.has(messageId)) urls.set(messageId, Promise.resolve(URL.createObjectURL(blob)));
}

/** Mensagem apagada: libera a memória da imagem */
export function forgetImage(messageId: string): void {
  const url = urls.get(messageId);
  if (!url) return;
  urls.delete(messageId);
  void url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
}

/** Imagem dentro da mensagem: já ocupa o tamanho certo antes de carregar (a conversa não pula) */
export function ChatImage({ message, compact }: { message: ChatMessage; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    imageUrl(message.id)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [message.id]);

  const { width, height } = message.image!;
  const scale = Math.min(1, (compact ? 240 : 360) / width, 320 / height);
  const box = { width: Math.max(48, Math.round(width * scale)), height: Math.max(48, Math.round(height * scale)) };

  return (
    <>
      <button
        type="button"
        className="msg-image"
        style={box}
        disabled={!url}
        aria-label={url ? "Abrir imagem" : failed ? "Imagem não carregou" : "Carregando imagem"}
        onClick={() => setOpen(true)}
      >
        {url ? (
          <img src={url} alt="" draggable={false} />
        ) : failed ? (
          <span className="msg-image-fail">
            <ImageOff size={18} aria-hidden="true" />
            Não carregou
          </span>
        ) : null}
      </button>
      {open && url && <ImageViewer url={url} name={`toca-${message.id.slice(-8)}`} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Imagem em tela cheia. Esc ou clique fora fecham. */
function ImageViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="img-viewer" role="dialog" aria-modal="true" aria-label="Imagem" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="img-viewer-bar">
        <a className="ib" href={url} download={name} aria-label="Salvar imagem" data-tip="Salvar imagem">
          <Download size={18} aria-hidden="true" />
        </a>
        <button ref={closeRef} type="button" className="ib" aria-label="Fechar (Esc)" data-tip="Fechar (Esc)" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <img src={url} alt="" onClick={onClose} />
    </div>,
    document.body,
  );
}
