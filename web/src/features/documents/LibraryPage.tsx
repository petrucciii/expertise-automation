import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Trash2, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { useDocuments } from '../../lib/queries';
import { extractionStatuses, formatDate } from '../../lib/labels';
import type { DocumentRecord } from '../../lib/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  IconButton,
  Loading,
  PageTitle,
} from '../../components/ui';
import { DocumentReader } from './DocumentReader';
import { UploadForm } from './UploadForm';

export default function LibraryPage() {
  const query = useDocuments();
  const cache = useQueryClient();
  const [upload, setUpload] = useState(false);
  const [reader, setReader] = useState<DocumentRecord | null>(null);
  const [removing, setRemoving] = useState<DocumentRecord | null>(null);
  const [filter, setFilter] = useState('');
  const download = useMutation({
    mutationFn: (document: DocumentRecord) => api.downloadDocument(document),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteDocument(removing!.id),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['documents'] }),
        cache.invalidateQueries({ queryKey: ['case'] }),
        cache.invalidateQueries({ queryKey: ['artifacts'] }),
        cache.invalidateQueries({ queryKey: ['latest'] }),
        cache.invalidateQueries({ queryKey: ['versions'] }),
        cache.invalidateQueries({ queryKey: ['register'] }),
      ]);
      cache.removeQueries({ queryKey: ['content', removing?.id] });
      setRemoving(null);
    },
  });
  const documents =
    query.data?.pages
      .flat()
      .filter((document) =>
        document.fileName
          .toLocaleLowerCase('it')
          .includes(filter.toLocaleLowerCase('it')),
      ) || [];
  return (
    <div className="page-container">
      <PageTitle
        title="Libreria documenti"
        description="I tuoi originali. Puoi collegare lo stesso documento a più pratiche."
        action={
          <Button onClick={() => setUpload(true)}>
            <Upload size={16} />
            Carica documento
          </Button>
        }
      />
      <div className="toolbar">
        <label className="sr-only" htmlFor="document-search">
          Cerca nei documenti caricati
        </label>
        <input
          id="document-search"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Cerca nei documenti caricati"
        />
      </div>
      <ErrorNotice
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      <ErrorNotice error={download.error} />
      {query.isPending && <Loading />}
      {!query.isPending && documents.length === 0 && (
        <EmptyState
          title={
            filter
              ? 'Nessun documento corrisponde'
              : 'I tuoi documenti, in un posto solo'
          }
          action={
            !filter && (
              <Button variant="secondary" onClick={() => setUpload(true)}>
                Carica il primo documento
              </Button>
            )
          }
        >
          {filter
            ? 'Prova un altro nome o carica altre pagine della libreria.'
            : 'Carica un originale e collegalo dal registro delle fonti di una pratica.'}
        </EmptyState>
      )}
      <div className="record-list">
        {documents.map((document) => (
          <article className="record-card" key={document.id}>
            <div className="record-heading">
              <div>
                <h3>
                  <FileText size={17} /> {document.fileName}
                </h3>
                <p>
                  {formatDate(document.created_at)} · {document.mimeType}
                </p>
              </div>
              <div className="record-actions">
                <IconButton
                  label={`Leggi ${document.fileName}`}
                  onClick={() => setReader(document)}
                >
                  <Eye size={17} />
                </IconButton>
                <IconButton
                  label={`Scarica ${document.fileName}`}
                  disabled={download.isPending}
                  onClick={() => download.mutate(document)}
                >
                  <Download size={17} />
                </IconButton>
                <IconButton
                  label={`Rimuovi ${document.fileName}`}
                  onClick={() => {
                    remove.reset();
                    setRemoving(document);
                  }}
                >
                  <Trash2 size={17} />
                </IconButton>
              </div>
            </div>
            <div className="record-meta">
              <Badge
                value={document.extractionStatus}
                label={extractionStatuses[document.extractionStatus]}
              />
              {document.extractionTruncated && (
                <Badge value="STALE" label="Testo troncato" />
              )}
              {document.extractionReviewedAt && (
                <span>
                  Controllato il {formatDate(document.extractionReviewedAt)}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
      {query.hasNextPage && (
        <div className="form-actions">
          <Button
            variant="secondary"
            busy={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            Carica altri documenti
          </Button>
        </div>
      )}
      <UploadForm open={upload} onClose={() => setUpload(false)} />
      <DocumentReader
        document={reader}
        open={Boolean(reader)}
        onClose={() => setReader(null)}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Rimuovere il documento?"
        destructive
        confirmLabel="Rimuovi documento"
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
      >
        Il file non sarà più scaricabile. I riferimenti nelle pratiche
        rimarranno come non accessibili e i risultati collegati dovranno essere
        aggiornati.
      </ConfirmDialog>
    </div>
  );
}
