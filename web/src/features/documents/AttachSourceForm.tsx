import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { parseJsonInput } from '../../lib/json-input';
import { useDocuments, useInvalidateCase } from '../../lib/queries';
import { availabilities, documentTypes } from '../../lib/labels';
import type { Availability, DocumentRecord, JsonObject } from '../../lib/types';
import {
  Button,
  ErrorNotice,
  Field,
  Loading,
  Modal,
} from '../../components/ui';

export function AttachSourceForm({
  caseId,
  open,
  onClose,
  initialDocument,
}: {
  caseId: string;
  open: boolean;
  onClose: () => void;
  initialDocument?: DocumentRecord | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aggiungi una fonte"
      description="Collega un originale oppure registra un estratto o un documento non disponibile."
      wide
    >
      {open && (
        <AttachFields
          caseId={caseId}
          onClose={onClose}
          initialDocument={initialDocument}
        />
      )}
    </Modal>
  );
}
function AttachFields({
  caseId,
  onClose,
  initialDocument,
}: {
  caseId: string;
  onClose: () => void;
  initialDocument?: DocumentRecord | null;
}) {
  const library = useDocuments();
  const invalidate = useInvalidateCase(caseId);
  const [availability, setAvailability] = useState<Availability>(
    'ORIGINAL_ACCESSIBLE',
  );
  const [documentId, setDocumentId] = useState(initialDocument?.id || '');
  const [name, setName] = useState(initialDocument?.fileName || '');
  const [type, setType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [date, setDate] = useState('');
  const [author, setAuthor] = useState('');
  const [metadata, setMetadata] = useState('');
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: api.attach.bind(null, caseId),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  const libraryRecords = library.data?.pages.flat() || [];
  const documents =
    initialDocument &&
    !libraryRecords.some((item) => item.id === initialDocument.id)
      ? [initialDocument, ...libraryRecords]
      : libraryRecords;
  const fileAllowed =
    availability === 'ORIGINAL_ACCESSIBLE' || availability === 'EXCERPT_ONLY';
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      let extra: JsonObject | undefined;
      if (metadata.trim()) {
        const parsed = parseJsonInput(metadata);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        )
          throw new Error('I metadati devono essere un oggetto JSON.');
        extra = parsed as JsonObject;
      }
      mutation.mutate({
        availability,
        ...(fileAllowed && documentId ? { documentId } : {}),
        ...(name.trim() ? { displayName: name.trim() } : {}),
        ...(type ? { documentType: type } : {}),
        ...(purpose.trim() ? { verificationPurpose: purpose.trim() } : {}),
        ...(availability === 'EXCERPT_ONLY' && excerpt.trim()
          ? { excerptText: excerpt.trim() }
          : {}),
        ...(date ? { documentDate: date } : {}),
        ...(author.trim() ? { senderOrAuthor: author.trim() } : {}),
        ...(extra ? { metadata: extra } : {}),
      });
    } catch (cause) {
      setError(cause);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label="Disponibilità della fonte">
        {(id) => (
          <select
            id={id}
            value={availability}
            onChange={(e) => setAvailability(e.target.value as Availability)}
          >
            {Object.entries(availabilities).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
      {fileAllowed && (
        <>
          <Field
            label="Documento dalla libreria"
            required={availability === 'ORIGINAL_ACCESSIBLE'}
            help={
              availability === 'EXCERPT_ONLY'
                ? 'Puoi scegliere un file oppure incollare il testo dell’estratto.'
                : 'Carica prima il file nella libreria.'
            }
          >
            {(id, helpId) => (
              <select
                id={id}
                aria-describedby={helpId}
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                required={availability === 'ORIGINAL_ACCESSIBLE'}
              >
                <option value="">
                  {availability === 'EXCERPT_ONLY'
                    ? 'Nessun file · uso il testo sotto'
                    : 'Scegli un documento'}
                </option>
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.fileName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {library.isPending && <Loading />}
          <ErrorNotice
            error={library.error}
            retry={() => {
              void library.refetch();
            }}
          />
          {library.hasNextPage && (
            <Button
              type="button"
              variant="ghost"
              busy={library.isFetchingNextPage}
              onClick={() => {
                void library.fetchNextPage();
              }}
            >
              Carica altri documenti della libreria
            </Button>
          )}
        </>
      )}
      <div className="form-grid">
        <Field label="Nome nel registro" required={!fileAllowed}>
          {(id) => (
            <input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={240}
              required={!fileAllowed}
            />
          )}
        </Field>
        <Field label="Tipo di documento">
          {(id) => (
            <select
              id={id}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Non classificato</option>
              {documentTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Data del documento">
          {(id) => (
            <input
              id={id}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Autore o mittente">
          {(id) => (
            <input
              id={id}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={240}
            />
          )}
        </Field>
      </div>
      <Field label="Finalità della verifica">
        {(id) => (
          <textarea
            id={id}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={2}
            maxLength={1200}
          />
        )}
      </Field>
      {availability === 'EXCERPT_ONLY' && (
        <Field
          label="Testo dell’estratto"
          required={!documentId}
          help="Mantieni il testo letterale e indica nel nome o nella finalità l’ambito dell’estratto."
        >
          {(id, helpId) => (
            <textarea
              id={id}
              aria-describedby={helpId}
              rows={6}
              maxLength={30000}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              required={!documentId}
            />
          )}
        </Field>
      )}
      <details>
        <summary className="small muted">Metadati aggiuntivi</summary>
        <Field label="Metadati JSON">
          {(id) => (
            <textarea
              id={id}
              className="mono"
              rows={3}
              maxLength={8000}
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              placeholder='{"lotto": "..."}'
            />
          )}
        </Field>
      </details>
      <ErrorNotice error={error || mutation.error} />
      <div className="form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Annulla
        </Button>
        <Button type="submit" busy={mutation.isPending}>
          Aggiungi fonte
        </Button>
      </div>
    </form>
  );
}
