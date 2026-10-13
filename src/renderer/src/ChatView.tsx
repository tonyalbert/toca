import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, ImagePlus, MessageSquare, SendHorizontal, Trash2, UserPlus, X } from "lucide-react";
import {
  deleteMessage,
  fetchDmMessages,
  fetchRoomMessages,
  MAX_MESSAGE,
  sendDm,
  sendRoomMessage,
  type ChatMessage,
} from "./api";
import { ChatImage, firstImage, forgetImage, IMAGE_ACCEPT, prepareImage, rememberImage, toBase64, type PreparedImage } from "./chatImage";
import { Avatar } from "./components/Avatar";
import { IconButton } from "./components/Button";
import { useConfirm } from "./components/ConfirmDialog";
import { usePeople } from "./people";
import { targetKey, type Chat, type ChatTarget } from "./useChat";

/** Mensagens seguidas do mesmo autor, com menos que isto entre elas, ficam juntas */
const GROUP_MS = 5 * 60_000;

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Hoje";
  if (dayKey(d) === dayKey(yesterday)) return "Ontem";
  return dayFmt.format(d) + (d.getFullYear() !== today.getFullYear() ? ` de ${d.getFullYear()}` : "");
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/** Texto com os links clicáveis (abrem no navegador) */
function withLinks(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"]+)/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/**
 * Uma conversa: chat da sala ou conversa direta. Carrega as mais antigas ao
 * rolar para cima, recebe as novas em tempo real e marca como lida enquanto
 * está na tela.
 */
export function ChatView({
  target,
  chat,
  header,
  compact,
  onClose,
  placeholder,
  canModerate,
}: {
  target: ChatTarget;
  chat: Chat;
  /** Cabeçalho (nome da sala ou da pessoa) */
  header: ReactNode;
  /** Painel ao lado da chamada */
  compact?: boolean;
  onClose?: () => void;
  placeholder: string;
  /** Dono ou adm da sala: apaga mensagens dos outros também */
  canModerate?: boolean;
}) {
  const { me, openPerson } = usePeople();
  const confirm = useConfirm();
  const key = targetKey(target);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Imagem anexada, esperando o envio (url: a miniatura)
  const [attachment, setAttachment] = useState<(PreparedImage & { url: string }) | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Ao carregar as antigas, mantém a mesma mensagem no lugar
  const keepFrom = useRef<number | null>(null);
  const stickToBottom = useRef(true);

  const fetchPage = useCallback(
    (before?: string) => (target.kind === "room" ? fetchRoomMessages(target.roomId, before) : fetchDmMessages(target.userId, before)),
    [key],
  );

  // Abriu a conversa: carrega as últimas e avisa que está na tela
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setHasMore(false);
    setLoading(true);
    setLoadError(null);
    setSendError(null);
    setAttachment(null);
    stickToBottom.current = true;
    fetchPage()
      .then((page) => {
        if (cancelled) return;
        // Junta com o que já chegou (enviada ou em tempo real) enquanto carregava
        setMessages((current) => {
          const loaded = new Set(page.messages.map((m) => m.id));
          const after = current.filter((m) => !loaded.has(m.id));
          return [...page.messages, ...after];
        });
        setHasMore(page.hasMore);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false));
    chat.setOpen(key);
    chat.markRead(target);
    inputRef.current?.focus();
    return () => {
      cancelled = true;
      chat.setOpen(null);
    };
  }, [key]);

  // Voltou para a janela: o que chegou enquanto estava fora conta como lido
  useEffect(() => {
    const onFocus = () => chat.markRead(target);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [key]);

  // Novas e apagadas, em tempo real
  useEffect(
    () =>
      chat.subscribe((e) => {
        if (e.key !== key) return;
        if (e.type === "deleted") {
          forgetImage(e.messageId);
          setMessages((list) => list.filter((m) => m.id !== e.messageId));
          return;
        }
        const el = listRef.current;
        stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80 || e.message.author.id === me.id;
        setMessages((list) => (list.some((m) => m.id === e.message.id) ? list : [...list, e.message]));
        if (e.message.author.id !== me.id && document.hasFocus()) chat.markRead(target);
      }),
    [key, me.id],
  );

  // Rolagem: fica no fim quando chega mensagem; ao carregar antigas, não pula
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (keepFrom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFrom.current;
      keepFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Chegou no topo: carrega as mais antigas
  useEffect(() => {
    const el = topRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingOlder || messages.length === 0) return;
        setLoadingOlder(true);
        try {
          const page = await fetchPage(messages[0].id);
          const list = listRef.current;
          keepFrom.current = list ? list.scrollHeight - list.scrollTop : null;
          stickToBottom.current = false;
          setMessages((current) => [...page.messages.filter((m) => !current.some((c) => c.id === m.id)), ...current]);
          setHasMore(page.hasMore);
        } catch {
          // tenta de novo na próxima rolagem
        }
        setLoadingOlder(false);
      },
      { root: listRef.current, rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingOlder, messages, fetchPage]);

  // A miniatura do anexo sai da memória quando ele é trocado ou enviado
  useEffect(() => (attachment ? () => URL.revokeObjectURL(attachment.url) : undefined), [attachment]);

  const attach = async (file: File | null) => {
    if (!file) return;
    setSendError(null);
    setPreparing(true);
    try {
      const image = await prepareImage(file);
      setAttachment({ ...image, url: URL.createObjectURL(image.blob) });
    } catch (err) {
      setSendError((err as Error).message);
    }
    setPreparing(false);
    inputRef.current?.focus();
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !attachment) || sending || preparing) return;
    if (body.length > MAX_MESSAGE) {
      setSendError(`A mensagem passou de ${MAX_MESSAGE} caracteres.`);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const image = attachment ? { data: await toBase64(attachment.blob) } : undefined;
      const message =
        target.kind === "room" ? await sendRoomMessage(target.roomId, body, image) : await sendDm(target.userId, body, image);
      if (attachment && message.image) rememberImage(message.id, attachment.blob);
      stickToBottom.current = true;
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      setText("");
      setAttachment(null);
    } catch (err) {
      setSendError((err as Error).message);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const remove = async (message: ChatMessage) => {
    const ok = await confirm({
      title:
        message.kind === "joined"
          ? "Apagar este aviso?"
          : message.author.id === me.id
            ? "Apagar mensagem?"
            : `Apagar a mensagem de ${message.author.displayName}?`,
      message: "Ela some para todo mundo na conversa. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteMessage(message.id);
      forgetImage(message.id);
      setMessages((list) => list.filter((m) => m.id !== message.id));
    } catch (err) {
      setSendError((err as Error).message);
    }
  };

  // Caixa de texto cresce até 6 linhas
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 21 + 20)}px`;
  }, [text]);

  return (
    <section
      className={`chat ${compact ? "compact" : ""} ${dragging ? "dragging" : ""}`}
      aria-label="Conversa"
      // Arrastar uma imagem para cima da conversa anexa
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        const file = firstImage(e.dataTransfer.files);
        if (file) void attach(file);
        else setSendError("Só dá para anexar imagens.");
      }}
    >
      {dragging && (
        <div className="chat-drop" aria-hidden="true">
          <ImagePlus size={28} />
          Solte para anexar a imagem
        </div>
      )}
      <div className="chat-h">
        <div className="grow">{header}</div>
        {onClose && (
          <IconButton size="sm" label="Fechar o chat" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <div className="chat-list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        <div ref={topRef} className="chat-top">
          {hasMore ? (loadingOlder ? "Carregando mensagens anteriores…" : "") : !loading && messages.length > 0 ? "Início da conversa" : ""}
        </div>
        {loading && <p className="chat-note">Carregando…</p>}
        {loadError && (
          <p className="chat-note error">
            <CircleAlert size={15} aria-hidden="true" /> Não deu para carregar: {loadError}
          </p>
        )}
        {!loading && !loadError && messages.length === 0 && (
          <div className="chat-empty">
            <MessageSquare size={28} aria-hidden="true" />
            <strong>Nenhuma mensagem ainda</strong>
            <span className="sm muted">Mande a primeira.</span>
          </div>
        )}
        {messages.map((m, i) => {
          const at = new Date(m.createdAt);
          const prev = messages[i - 1];
          const prevAt = prev ? new Date(prev.createdAt) : null;
          const newDay = !prevAt || dayKey(prevAt) !== dayKey(at);
          const grouped =
            !newDay &&
            !!prev &&
            prev.kind !== "joined" &&
            prev.author.id === m.author.id &&
            at.getTime() - prevAt!.getTime() < GROUP_MS;
          const mine = m.author.id === me.id;
          if (m.kind === "joined") {
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="chat-day" role="separator">
                    <span>{dayLabel(at)}</span>
                  </div>
                )}
                <div className="msg-system">
                  <UserPlus size={14} aria-hidden="true" />
                  <span>
                    <button type="button" className="msg-author" onClick={(e) => openPerson(m.author.id, e.currentTarget)}>
                      {mine ? "Você" : m.author.displayName}
                    </button>{" "}
                    entrou na toca
                  </span>
                  <time className="msg-time num" dateTime={m.createdAt}>
                    {timeFmt.format(at)}
                  </time>
                  {canModerate && (
                    <IconButton size="sm" className="msg-del" label="Apagar aviso" onClick={() => void remove(m)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              </Fragment>
            );
          }
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="chat-day" role="separator">
                  <span>{dayLabel(at)}</span>
                </div>
              )}
              <div className={`msg ${grouped ? "cont" : ""} ${mine ? "mine" : ""}`}>
                {grouped ? (
                  <span className="msg-side-time num" aria-hidden="true">
                    {timeFmt.format(at)}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="msg-avatar"
                    aria-label={`${m.author.displayName}: ver cartão`}
                    onClick={(e) => openPerson(m.author.id, e.currentTarget)}
                  >
                    <Avatar kind={m.author.avatar} photo={m.author.photo} size={36} mine={mine} />
                  </button>
                )}
                <div className="msg-body">
                  {!grouped && (
                    <div className="msg-head">
                      <button type="button" className="msg-author" onClick={(e) => openPerson(m.author.id, e.currentTarget)}>
                        {mine ? "Você" : m.author.displayName}
                      </button>
                      <time className="msg-time num" dateTime={m.createdAt}>
                        {timeFmt.format(at)}
                      </time>
                    </div>
                  )}
                  {m.body && <div className="msg-text">{withLinks(m.body)}</div>}
                  {m.image && <ChatImage message={m} compact={compact} />}
                </div>
                {(mine || (canModerate && target.kind === "room")) && (
                  <IconButton size="sm" className="msg-del" label="Apagar mensagem" onClick={() => void remove(m)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {sendError && (
          <span className="err" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            {sendError}
          </span>
        )}
        {(attachment || preparing) && (
          <div className="chat-attach">
            {attachment ? <img src={attachment.url} alt="" /> : <span className="chat-attach-wait" />}
            <span className="sm muted">{attachment ? `Imagem · ${formatSize(attachment.blob.size)}` : "Preparando a imagem…"}</span>
            {attachment && (
              <IconButton size="sm" label="Tirar a imagem" onClick={() => setAttachment(null)}>
                <X size={14} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
        <div className="chat-input">
          <IconButton label="Anexar imagem" className="chat-attach-btn" disabled={sending || preparing} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={18} aria-hidden="true" />
          </IconButton>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => {
              void attach(firstImage(e.target.files));
              e.target.value = "";
            }}
          />
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder={placeholder}
            aria-label={placeholder}
            maxLength={MAX_MESSAGE + 200}
            onChange={(e) => {
              setText(e.target.value);
              setSendError(null);
            }}
            onPaste={(e) => {
              // Ctrl+V com uma imagem (print, imagem copiada) anexa
              const file = firstImage(e.clipboardData.files);
              if (!file) return;
              e.preventDefault();
              void attach(file);
            }}
            onKeyDown={(e) => {
              // Enter envia; Shift+Enter quebra a linha
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {text.length > MAX_MESSAGE - 200 && (
            <span className={`chat-count num ${text.length > MAX_MESSAGE ? "over" : ""}`}>{MAX_MESSAGE - text.length}</span>
          )}
          <IconButton type="submit" label="Enviar (Enter)" className="chat-send" disabled={(!text.trim() && !attachment) || sending || preparing}>
            <SendHorizontal size={18} aria-hidden="true" />
          </IconButton>
        </div>
        {!compact && <span className="chat-hint xs faint">Enter envia · Shift+Enter pula linha · Ctrl+V cola imagem</span>}
      </form>
    </section>
  );
}
