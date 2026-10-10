import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import { availabilities, formatDate, sourceName } from '../../lib/labels';
import type { CaseSource, DocumentRecord } from '../../lib/types';
import {
  Badge,
  Button,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Notice,
} from '../../components/ui';

export function DocumentReader({
  document,
  source,
  open,
  onClose,
}: {
  document?: DocumentRecord | null;
  source?: CaseSource;
  open: boolean;
  onClose: () => void;
}) {
  const accessible =
    !source ||
    ['ORIGINAL_ACCESSIBLE', 'EXCERPT_ONLY'].includes(source.availability);
  const original = document || source?.document;
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        source
          ? `${source.sourceCode} · ${sourceName(source)}`
          : original?.fileName || 'Fonte'
      }
      description={
        source
          ? availabilities[source.availability]
          : 'Confronta il testo estratto con l’originale.'
      }
    >
      {open && (
        <ReaderContent
          document={accessible ? original : undefined}
          source={source}
        />
      )}
    </Modal>
  );
}
function ReaderContent({
  document,
  source,
}: {
  document?: DocumentRecord | null;
  source?: CaseSource;
}) {
  const cache = useQueryClient();
  const [reviewed, setReviewed] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['content', document?.id],
    queryFn: () => api.content(document!.id),
    enabled: Boolean(document?.id),
    staleTime: Infinity,
    retry: false,
  });
  const download = useMutation({
    mutationFn: () => api.downloadDocument(document!),
  });
  const review = useMutation({
    mutationFn: () => api.reviewContent(document!.id),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['content', document?.id] }),
        cache.invalidateQueries({ queryKey: ['documents'] }),
        cache.invalidateQueries({ queryKey: ['case'] }),
        cache.invalidateQueries({ queryKey: ['artifacts'] }),
        cache.invalidateQueries({ queryKey: ['latest'] }),
        cache.invalidateQueries({ queryKey: ['versions'] }),
        cache.invalidateQueries({ queryKey: ['register'] }),
      ]);
    },
  });
  useEffect(() => {
    if (query.dataUpdatedAt) {
      void cache.invalidateQueries({ queryKey: ['case'] });
      void cache.invalidateQueries({ queryKey: ['artifacts'] });
      void cache.invalidateQueries({ queryKey: ['latest'] });
      void cache.invalidateQueries({ queryKey: ['versions'] });
      void cache.invalidateQueries({ queryKey: ['documents'] });
      void cache.invalidateQueries({ queryKey: ['register'] });
    }
  }, [cache, query.dataUpdatedAt]);
  const data = query.data;
  const pages = data?.pages || [];
  const text = document
    ? pages[page]?.text || (pages.length ? '' : data?.content || '')
    : source?.excerptText || '';
  return (
    <>
      <div className="reader-actions">
        {document && (
          <Button
            variant="secondary"
            busy={download.isPending}
            onClick={() => download.mutate()}
          >
            <Download size={16} />
            Scarica originale
            <ExternalLink size={13} />
          </Button>
        )}
        {data && (
          <Badge
            value={data.extractionStatus}
            label={
              data.extractionStatus === 'PENDING' ? 'Da leggere' : undefined
            }
          />
        )}
      </div>
      <ErrorNotice error={download.error} />
      <ErrorNotice
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      {document && query.isPending && (
        <Loading label="Lettura del documento…" />
      )}
      {source && (
        <div className="record-meta">
          {source.documentType && <span>Tipo: {source.documentType}</span>}
          {source.senderOrAuthor && (
            <span>Autore / mittente: {source.senderOrAuthor}</span>
          )}
          {source.documentDate && (
            <span>{formatDate(source.documentDate)}</span>
          )}
        </div>
      )}
      {source?.verificationPurpose && (
        <p className="record-body">Finalità: {source.verificationPurpose}</p>
      )}
      {data?.extractionTruncated && (
        <Notice tone="warning">
          Il testo è troncato e non può essere confermato come completo.
          Registra un estratto più piccolo con il suo ambito.
        </Notice>
      )}
      {data?.extractionStatus === 'NEEDS_REVIEW' &&
        !data.extractionTruncated && (
          <Notice tone="warning">
            Il testo richiede controllo umano. Apri l’originale, confronta
            quantità, date e citazioni, poi conferma la lettura.
          </Notice>
        )}
      {pages.length > 0 && (
        <Field label="Pagina del documento">
          {(id) => (
            <select
              id={id}
              value={page}
              onChange={(event) => {
                setPage(Number(event.target.value));
                setExpanded(false);
              }}
            >
              {pages.map((item, index) => (
                <option key={item.pageNumber} value={index}>
                  Pagina {item.pageNumber}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {text ? (
        <div className="document-content">
          <div className="content-page">
            <h3>
              {pages.length
                ? `Pagina ${pages[page]?.pageNumber}`
                : source?.excerptText && !document
                  ? 'Estratto registrato'
                  : 'Testo estratto'}
            </h3>
            <pre>{expanded ? text : text.slice(0, 50000)}</pre>
            {!expanded && text.length > 50000 && (
              <Button variant="ghost" onClick={() => setExpanded(true)}>
                Mostra tutto il testo della pagina
              </Button>
            )}
          </div>
        </div>
      ) : (
        (!document || !query.isPending) &&
        !query.error && (
          <Notice>
            {document
              ? 'Non è stato riconosciuto testo in questo documento.'
              : 'Non è disponibile un originale o un estratto da leggere per questa fonte.'}
          </Notice>
        )
      )}
      {data?.sourceMetadata && (
        <details className="record-body">
          <summary>Metadati del documento</summary>
          <pre>{JSON.stringify(data.sourceMetadata, null, 2)}</pre>
        </details>
      )}
      {source?.document?.hash && (
        <div className="record-meta">
          <span>
            SHA-256 <code>{source.document.hash}</code>
          </span>
        </div>
      )}
      {data?.extractionStatus === 'NEEDS_REVIEW' &&
        !data.extractionTruncated &&
        Boolean(data.content.trim()) && (
          <>
            <label className="check-option">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              <span>Ho confrontato il testo estratto con l’originale.</span>
            </label>
            <Button
              busy={review.isPending}
              disabled={!reviewed}
              onClick={() => review.mutate()}
            >
              Conferma il testo controllato
            </Button>
            <ErrorNotice error={review.error} />
          </>
        )}
      {data?.extractionReviewedAt && (
        <p className="file-help">
          Testo controllato il {formatDate(data.extractionReviewedAt, true)}.
        </p>
      )}
    </>
  );
}
