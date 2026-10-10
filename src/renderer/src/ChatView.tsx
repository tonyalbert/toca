import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, MessageSquare, SendHorizontal, Trash2, X } from "lucide-react";
import {
  deleteMessage,
  fetchDmMessages,
  fetchRoomMessages,
  MAX_MESSAGE,
  sendDm,
  sendRoomMessage,
  type ChatMessage,
} from "./api";
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
}: {
  target: ChatTarget;
  chat: Chat;
  /** Cabeçalho (nome da sala ou da pessoa) */
  header: ReactNode;
  /** Painel ao lado da chamada */
  compact?: boolean;
  onClose?: () => void;
  placeholder: string;
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

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > MAX_MESSAGE) {
      setSendError(`A mensagem passou de ${MAX_MESSAGE} caracteres.`);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const message = target.kind === "room" ? await sendRoomMessage(target.roomId, body) : await sendDm(target.userId, body);
      stickToBottom.current = true;
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      setText("");
    } catch (err) {
      setSendError((err as Error).message);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const remove = async (message: ChatMessage) => {
    const ok = await confirm({
      title: "Apagar mensagem?",
      message: "Ela some para todo mundo na conversa. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteMessage(message.id);
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
    <section className={`chat ${compact ? "compact" : ""}`} aria-label="Conversa">
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
          const grouped = !newDay && !!prev && prev.author.id === m.author.id && at.getTime() - prevAt!.getTime() < GROUP_MS;
          const mine = m.author.id === me.id;
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
                    <Avatar kind={m.author.avatar} size={36} mine={mine} />
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
                  <div className="msg-text">{withLinks(m.body)}</div>
                </div>
                {mine && (
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
        <div className="chat-input">
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
          <IconButton type="submit" label="Enviar (Enter)" className="chat-send" disabled={!text.trim() || sending}>
            <SendHorizontal size={18} aria-hidden="true" />
          </IconButton>
        </div>
        {!compact && <span className="chat-hint xs faint">Enter envia · Shift+Enter pula linha</span>}
      </form>
    </section>
  );
}
