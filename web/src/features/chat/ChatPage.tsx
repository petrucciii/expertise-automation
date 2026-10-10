import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  Check,
  ClipboardList,
  Copy,
  FileText,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { reportSections } from '../../lib/artifact-content';
import { sourceName } from '../../lib/labels';
import type { CaseSource, ChatInput, Citation, Message } from '../../lib/types';
import {
  Button,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Notice,
} from '../../components/ui';
import { useCase } from '../cases/case-context';
import { DocumentReader } from '../documents/DocumentReader';

const messagePageSize = 50;
const messageOffsetLimit = 100000;
const messageHistoryLimit = messageOffsetLimit + messagePageSize;

export default function ChatPage() {
  const record = useCase();
  const { chatId } = useParams();
  // Navigating to another conversation resets only that conversation's draft and selections.
  return (
    <Conversation key={`${record.id}:${chatId || 'new'}`} chatId={chatId} />
  );
}
function Conversation({ chatId }: { chatId?: string }) {
  const record = useCase();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [search] = useSearchParams();
  const [message, setMessage] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [useSelected, setUseSelected] = useState(false);
  const [target, setTarget] = useState(search.get('section') || '');
  const [clientError, setClientError] = useState<unknown>(null);
  const [reader, setReader] = useState<CaseSource | null>(null);
  const [citation, setCitation] = useState<Citation | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({
    queryKey: ['chat', chatId, record.id],
    queryFn: async ({ pageParam }) => {
      const first = await api.chat(chatId!, pageParam || 0);
      if (first.caseId !== record.id)
        throw new ApiError(
          404,
          'Questa conversazione appartiene a un’altra pratica. Aprila dallo storico della pratica corretta.',
        );
      const latestOffset = Math.min(
        messageOffsetLimit,
        Math.floor(Math.max(0, first._count.messages - 1) / messagePageSize) *
          messagePageSize,
      );
      const offset = pageParam ?? latestOffset;
      return {
        ...(offset !== (pageParam || 0)
          ? await api.chat(chatId!, offset)
          : first),
        offset,
      };
    },
    enabled: Boolean(chatId),
    initialPageParam: null as number | null,
    getPreviousPageParam: (first) =>
      first.offset > 0 ? first.offset - messagePageSize : undefined,
    getNextPageParam: (last) =>
      last.offset + last.messages.length < last._count.messages &&
      last.offset < messageOffsetLimit
        ? last.offset + messagePageSize
        : undefined,
    retry: false,
  });
  const chatSources = useQuery({
    queryKey: ['chat-sources', chatId],
    queryFn: () => api.chatDocuments(chatId!),
    enabled: Boolean(chatId) && query.isSuccess,
    retry: false,
  });
  const artifacts = useQuery({
    queryKey: ['artifacts', record.id],
    queryFn: () => api.artifacts(record.id),
  });
  const report = artifacts.data?.find(
    (item) => item.type === 'SURVEY_REPORT_DRAFT',
  );
  const sections = report ? reportSections(report.content) : [];
  const messages = query.data?.pages.flatMap((page) => page.messages) || [];
  // Reserve space for both messages so a new reply cannot fall outside the API's pageable history.
  const historyLimitReached =
    (query.data?.pages[0]?._count.messages || 0) > messageHistoryLimit - 2;
  const sources = chatSources.data || record.documents;
  const available = sources.filter((source) =>
    ['ORIGINAL_ACCESSIBLE', 'EXCERPT_ONLY'].includes(source.availability),
  );
  const mutation = useMutation({
    mutationFn: (body: ChatInput) =>
      chatId ? api.sendMessage(chatId, body) : api.createChat(record.id, body),
    onSuccess: async (result) => {
      setMessage('');
      await cache.invalidateQueries({ queryKey: ['chats', record.id] });
      if (!chatId && result.chatId)
        await navigate(`/cases/${record.id}/chat/${result.chatId}`);
      else {
        await cache.resetQueries({ queryKey: ['chat', chatId] });
      }
    },
    onError: async () => {
      await cache.invalidateQueries({ queryKey: ['chats', record.id] });
      if (chatId) await cache.resetQueries({ queryKey: ['chat', chatId] });
    },
  });
  useEffect(() => {
    if (input.current) {
      input.current.style.height = 'auto';
      input.current.style.height = `${Math.min(input.current.scrollHeight, 220)}px`;
    }
  }, [message]);
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
  }, [lastMessageId, mutation.isPending]);
  function send(event?: FormEvent) {
    event?.preventDefault();
    setClientError(null);
    if (
      !message.trim() ||
      mutation.isPending ||
      historyLimitReached ||
      (chatId && !query.isSuccess)
    )
      return;
    if (useSelected && !documentIds.length) {
      setClientError(
        new Error(
          'Scegli almeno un documento oppure usa tutte le fonti della pratica.',
        ),
      );
      setOptionsOpen(true);
      return;
    }
    mutation.mutate({
      message: message.trim(),
      ...(useSelected ? { documentIds } : {}),
      ...(target ? { targetSection: target } : {}),
    });
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      window.matchMedia('(min-width: 768px)').matches
    ) {
      event.preventDefault();
      send();
    }
  }
  function openCitation(value: Citation) {
    setCitation(value);
    setReader(
      record.documents.find(
        (source) =>
          source.id === value.caseDocumentId ||
          source.documentId === value.documentId,
      ) || null,
    );
  }
  return (
    <div className="chat-page">
      <div className="chat-scroll">
        {chatId && query.isPending && (
          <Loading label="Apertura della conversazione…" />
        )}
        <ErrorNotice
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
        {historyLimitReached && (
          <Notice tone="warning">
            Questa conversazione ha raggiunto il limite dello storico
            consultabile.{' '}
            <Link to={`/cases/${record.id}`} className="text-button">
              Apri una nuova conversazione
            </Link>{' '}
            per continuare; lo storico rimane disponibile.
          </Notice>
        )}
        {query.hasPreviousPage && (
          <Button
            variant="secondary"
            busy={query.isFetchingPreviousPage}
            onClick={() => {
              void query.fetchPreviousPage();
            }}
          >
            Carica messaggi precedenti
          </Button>
        )}
        {!chatId && (
          <div className="chat-welcome">
            <div className="chat-mark">
              <Sparkles size={30} strokeWidth={1.4} />
            </div>
            <h2>Come lavoriamo su questa pratica?</h2>
            <p>Fai una domanda. L’assistente usa le fonti e cita i passaggi.</p>
            <div className="prompt-options">
              <button
                type="button"
                onClick={() => {
                  setMessage(
                    'Riassumi i fatti documentati e distingui ciò che resta non verificato.',
                  );
                  input.current?.focus();
                }}
              >
                <FileText size={15} />
                Riassumi le fonti
              </button>
              <button
                type="button"
                onClick={() => {
                  setMessage(
                    'Quali differenze sono comparabili e quali controlli devo ancora completare?',
                  );
                  input.current?.focus();
                }}
              >
                <ClipboardList size={15} />
                Trova le verifiche aperte
              </button>
              <button
                type="button"
                onClick={() => {
                  setMessage(
                    'Aiutami a rivedere il testo della relazione, mantenendo le attribuzioni e i riferimenti alle fonti.',
                  );
                  input.current?.focus();
                }}
              >
                <MessageCircle size={15} />
                Lavora sulla relazione
              </button>
            </div>
            {record.documents.length === 0 && (
              <Notice>
                <Link to="../sources" className="text-button">
                  Aggiungi una fonte
                </Link>{' '}
                per analizzare documenti e citazioni della pratica.
              </Notice>
            )}
          </div>
        )}
        {messages.map((item) => (
          <ChatMessage key={item.id} message={item} onCitation={openCitation} />
        ))}
        {query.hasNextPage && (
          <Button
            variant="secondary"
            busy={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            Carica altri messaggi
          </Button>
        )}
        {mutation.isPending && (
          <output className="assistant-heading">
            <LoaderCircle size={18} className="spin" />
            L’assistente sta leggendo il contesto…
          </output>
        )}
        <ErrorNotice error={clientError || mutation.error} />
        {mutation.isError && !chatId && (
          <Notice>
            Il messaggio può essere già nello storico senza risposta. Apri la
            conversazione salvata dalla barra laterale prima di riprovare.
          </Notice>
        )}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        {target || useSelected ? (
          <div className="chat-options-summary">
            {useSelected && (
              <span>{documentIds.length} documenti selezionati</span>
            )}
            {target && (
              <span>
                Sezione:{' '}
                {sections.find((section) => section.id === target)?.heading ||
                  target}
              </span>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setTarget('');
                setUseSelected(false);
                setDocumentIds([]);
              }}
            >
              Reimposta
            </button>
          </div>
        ) : null}
        <form className="composer" onSubmit={send}>
          <label htmlFor="chat-input" className="sr-only">
            Messaggio per l’assistente
          </label>
          <textarea
            id="chat-input"
            ref={input}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={keyDown}
            rows={2}
            maxLength={12000}
            placeholder="Scrivi sulla pratica…"
            disabled={
              mutation.isPending ||
              historyLimitReached ||
              Boolean(chatId && !query.isSuccess)
            }
          />
          <div className="composer-footer">
            <div className="composer-tools">
              <button
                type="button"
                className="composer-tool"
                onClick={() => setOptionsOpen(true)}
              >
                <Paperclip size={17} />
                Fonti{useSelected && ` · ${documentIds.length}`}
              </button>
              <button
                type="button"
                className="composer-tool"
                onClick={() => setOptionsOpen(true)}
              >
                <SlidersHorizontal size={16} />
                Sezione
              </button>
            </div>
            <button
              type="submit"
              className="send-button"
              aria-label="Invia messaggio"
              disabled={
                !message.trim() ||
                mutation.isPending ||
                historyLimitReached ||
                Boolean(chatId && !query.isSuccess)
              }
            >
              {mutation.isPending ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <ArrowUp size={20} />
              )}
            </button>
          </div>
        </form>
        <p className="composer-note">
          Verifica le risposte e le citazioni. L’assistente non approva la
          relazione.
        </p>
      </div>
      <Modal
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Contesto della conversazione"
        description="Scegli le fonti e, se serve, una sezione della relazione."
      >
        <label className="check-option">
          <input
            type="checkbox"
            checked={useSelected}
            onChange={(event) => setUseSelected(event.target.checked)}
          />
          <span>
            Usa soltanto i documenti selezionati
            <small>
              Fino a dieci. Gli estratti senza file non entrano nella selezione;
              le evidenze registrate rimangono nel contesto.
            </small>
          </span>
        </label>
        {useSelected && (
          <div className="check-option-list">
            {available
              .filter((source) => source.documentId)
              .map((source) => (
                <label key={source.id} className="check-option">
                  <input
                    type="checkbox"
                    checked={documentIds.includes(source.documentId!)}
                    disabled={
                      !documentIds.includes(source.documentId!) &&
                      documentIds.length >= 10
                    }
                    onChange={(event) =>
                      setDocumentIds(
                        event.target.checked
                          ? [...documentIds, source.documentId!]
                          : documentIds.filter(
                              (id) => id !== source.documentId,
                            ),
                      )
                    }
                  />
                  <span>
                    {source.sourceCode} · {sourceName(source)}
                  </span>
                </label>
              ))}
            {available.every((source) => !source.documentId) && (
              <p className="small muted">
                Non ci sono originali collegati da selezionare.
              </p>
            )}
          </div>
        )}
        <Field label="Sezione della relazione">
          {(id) => (
            <select
              id={id}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Intera pratica</option>
              {sections.map((section) => (
                <option value={section.id} key={section.id}>
                  {section.heading}
                </option>
              ))}
            </select>
          )}
        </Field>
        {report?.isStale && (
          <Notice tone="warning">
            La relazione è obsoleta. Il suo testo precedente non viene usato
            come versione corrente.
          </Notice>
        )}
        <ErrorNotice error={chatSources.error || artifacts.error} />
        <div className="form-actions">
          <Button onClick={() => setOptionsOpen(false)}>
            Usa questo contesto
          </Button>
        </div>
      </Modal>
      <Modal
        open={Boolean(citation)}
        onClose={() => {
          setCitation(null);
          setReader(null);
        }}
        title={`Citazione · ${citation?.caseDocument?.sourceCode || reader?.sourceCode || 'fonte'}`}
        description={
          citation?.pageNumber
            ? `Pagina ${citation.pageNumber}`
            : 'Passaggio citato dall’assistente'
        }
      >
        <blockquote className="citation-quote">{citation?.excerpt}</blockquote>
        {reader ? (
          <Button variant="secondary" onClick={() => setCitation(null)}>
            Apri il contenuto della fonte
          </Button>
        ) : (
          <Notice>
            La citazione rimane nello storico; il documento potrebbe non essere
            più accessibile.
          </Notice>
        )}
      </Modal>
      <DocumentReader
        source={reader || undefined}
        open={Boolean(reader && !citation)}
        onClose={() => setReader(null)}
      />
    </div>
  );
}
function ChatMessage({
  message,
  onCitation,
}: {
  message: Message;
  onCitation: (citation: Citation) => void;
}) {
  const record = useCase();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        new Error(
          'Non è possibile copiare automaticamente. Seleziona il testo e copialo.',
        ),
      );
    }
  }
  if (message.role === 'USER')
    return (
      <article
        className="chat-message chat-message-user"
        aria-label="Il tuo messaggio"
      >
        <div className="user-bubble">{message.content}</div>
      </article>
    );
  return (
    <article className="chat-message" aria-label="Risposta dell’assistente">
      <div className="assistant-heading">
        <Sparkles size={22} strokeWidth={1.4} />
        Expertise
      </div>
      <div className="assistant-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
            img: ({ alt }) => (
              <span>{alt ? `Immagine citata: ${alt}` : 'Immagine citata'}</span>
            ),
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
      {message.sources?.length > 0 && (
        <div className="chat-citations">
          {message.sources.map((source, index) => (
            <button
              type="button"
              key={source.id || index}
              className="source-chip"
              onClick={() => onCitation(source)}
            >
              <FileText size={12} />
              {source.caseDocument?.sourceCode ||
                record.documents.find(
                  (document) => document.documentId === source.documentId,
                )?.sourceCode ||
                source.document?.fileName ||
                `Fonte ${index + 1}`}
              {source.pageNumber && ` · p. ${source.pageNumber}`}
            </button>
          ))}
        </div>
      )}
      <div className="message-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={copied ? 'Risposta copiata' : 'Copia risposta'}
          onClick={() => {
            void copy();
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <span className="small muted">Da verificare sulle fonti</span>
      </div>
      <ErrorNotice error={error} />
    </article>
  );
}
