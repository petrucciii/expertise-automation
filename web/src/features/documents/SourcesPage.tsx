import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, Eye, Plus, ScanText, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { useInvalidateCase } from '../../lib/queries';
import { formatDate, sourceName } from '../../lib/labels';
import type { CaseSource, DocumentRecord } from '../../lib/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  IconButton,
  Notice,
  PageTitle,
} from '../../components/ui';
import { useCase } from '../cases/case-context';
import { DocumentReader } from './DocumentReader';
import { AttachSourceForm } from './AttachSourceForm';
import { UploadForm } from './UploadForm';

export default function SourcesPage() {
  const record = useCase();
  const invalidate = useInvalidateCase(record.id);
  const register = useQuery({
    queryKey: ['register', record.id],
    queryFn: () => api.registerSources(record.id),
  });
  const [attach, setAttach] = useState(false);
  const [upload, setUpload] = useState(false);
  const [initialDocument, setInitialDocument] = useState<DocumentRecord | null>(
    null,
  );
  const [reader, setReader] = useState<CaseSource | null>(null);
  const [success, setSuccess] = useState(false);
  const extract = useMutation({
    mutationFn: (source: CaseSource) =>
      api.extract(record.id, source.sourceCode),
    onSuccess: async () => {
      await invalidate();
      setSuccess(true);
    },
    // Parsing can persist OCR text requiring review even when no AI proposal can be created.
    onError: invalidate,
  });
  const download = useMutation({
    mutationFn: (document: DocumentRecord) => api.downloadDocument(document),
  });
  return (
    <div className="page-container">
      <PageTitle
        title="Fonti della pratica"
        description="Originali, estratti e documenti da ottenere. Ogni fonte ha un codice stabile."
        action={
          <>
            <Button variant="secondary" onClick={() => setUpload(true)}>
              <Upload size={15} />
              Carica file
            </Button>
            <Button
              onClick={() => {
                setInitialDocument(null);
                setAttach(true);
              }}
            >
              <Plus size={16} />
              Aggiungi fonte
            </Button>
          </>
        }
      />
      <ErrorNotice
        error={register.error}
        retry={() => {
          void register.refetch();
        }}
      />
      <ErrorNotice error={extract.error || download.error} />
      {success && (
        <Notice tone="success">
          Proposta creata.{' '}
          <Link className="text-button" to="../review">
            Apri le proposte da rivedere
          </Link>
        </Notice>
      )}
      {record.documents.length === 0 && (
        <EmptyState
          title="Da quali fonti partiamo?"
          action={
            <Button variant="secondary" onClick={() => setAttach(true)}>
              Aggiungi la prima fonte
            </Button>
          }
        >
          Collega un originale oppure registra un estratto o un documento non
          disponibile.
        </EmptyState>
      )}
      <div className="record-list">
        {record.documents.map((source) => {
          const entry = register.data?.find((item) => item.id === source.id);
          const accessible = ['ORIGINAL_ACCESSIBLE', 'EXCERPT_ONLY'].includes(
            source.availability,
          );
          const needsReview =
            source.document?.extractionStatus === 'NEEDS_REVIEW';
          const original = source.availability === 'ORIGINAL_ACCESSIBLE';
          const visionSupported = ['image/png', 'image/jpeg'].includes(
            source.document?.mimeType || '',
          );
          return (
            <article key={source.id} className="record-card">
              <div className="record-heading">
                <div>
                  <h3>
                    <span className="mono">{source.sourceCode}</span> ·{' '}
                    {sourceName(source)}
                  </h3>
                  <p>
                    {source.documentType || 'Tipo non classificato'}
                    {source.senderOrAuthor && ` · ${source.senderOrAuthor}`}
                    {source.documentDate &&
                      ` · ${formatDate(source.documentDate)}`}
                  </p>
                </div>
                <div className="record-actions">
                  <IconButton
                    label={`Apri ${source.sourceCode}`}
                    onClick={() => setReader(source)}
                  >
                    <Eye size={17} />
                  </IconButton>
                  {accessible && source.document && (
                    <IconButton
                      label={`Scarica originale ${source.sourceCode}`}
                      disabled={download.isPending}
                      onClick={() => download.mutate(source.document!)}
                    >
                      <Download size={17} />
                    </IconButton>
                  )}
                </div>
              </div>
              <div className="record-meta">
                <Badge value={source.availability} />
                {accessible && source.document && (
                  <Badge
                    value={source.document.extractionStatus}
                    label={
                      source.document.extractionStatus === 'PENDING'
                        ? 'Testo da leggere'
                        : undefined
                    }
                  />
                )}
                {entry?.sha256 && (
                  <details>
                    <summary>Hash originale</summary>
                    <code>{entry.sha256}</code>
                  </details>
                )}
              </div>
              {source.verificationPurpose && (
                <p className="record-body">{source.verificationPurpose}</p>
              )}
              <div className="reader-actions">
                {original ? (
                  <Button
                    variant="secondary"
                    busy={
                      extract.isPending && extract.variables?.id === source.id
                    }
                    disabled={
                      extract.isPending || (needsReview && !visionSupported)
                    }
                    onClick={() => {
                      setSuccess(false);
                      extract.mutate(source);
                    }}
                  >
                    <ScanText size={15} />
                    Proponi fatti ed eventi
                  </Button>
                ) : (
                  <span className="muted small">
                    {source.availability === 'EXCERPT_ONLY'
                      ? 'Usa l’estratto in chat o registra i fatti manualmente.'
                      : 'L’originale non è disponibile per l’estrazione.'}
                  </span>
                )}
                {needsReview && !visionSupported && (
                  <Button variant="ghost" onClick={() => setReader(source)}>
                    Controlla prima il testo
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <UploadForm
        open={upload}
        onClose={() => setUpload(false)}
        onUploaded={(document) => {
          setInitialDocument(document);
          setAttach(true);
        }}
      />
      <AttachSourceForm
        caseId={record.id}
        open={attach}
        initialDocument={initialDocument}
        onClose={() => {
          setAttach(false);
          setInitialDocument(null);
        }}
      />
      <DocumentReader
        source={reader || undefined}
        open={Boolean(reader)}
        onClose={() => setReader(null)}
      />
    </div>
  );
}
