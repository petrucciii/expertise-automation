import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { caseStatuses, families, lines } from '../../lib/labels';
import type { CaseFamily, CaseInput, CaseRecord } from '../../lib/types';
import { Button, ErrorNotice, Field, Modal } from '../../components/ui';
import { useInvalidateCase } from '../../lib/queries';

export function CaseForm({
  record,
  open,
  onClose,
}: {
  record?: CaseRecord;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={record ? 'Modifica la pratica' : 'Nuova pratica'}
      description="Definisci l’incarico. I dati della merce e del danno si registrano come evidenze con fonti."
      wide
    >
      {open && <CaseFormFields record={record} onClose={onClose} />}
    </Modal>
  );
}
function CaseFormFields({
  record,
  onClose,
}: {
  record?: CaseRecord;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(record?.title || '');
  const [reference, setReference] = useState(record?.internalReference || '');
  const [publicReference, setPublicReference] = useState(
    record?.publicReference || '',
  );
  const [family, setFamily] = useState<CaseFamily>(
    record?.caseFamily || 'CARGO_DAMAGE',
  );
  const [client, setClient] = useState(record?.assignment?.client || '');
  const [scope, setScope] = useState(
    record?.assignment?.requestedScope?.join('\n') || '',
  );
  const [limitations, setLimitations] = useState(
    record?.assignment?.limitations?.join('\n') || '',
  );
  const [questions, setQuestions] = useState(
    record?.openQuestions.join('\n') || '',
  );
  const [status, setStatus] = useState<CaseInput['status']>(
    record?.status === 'APPROVED' ? undefined : record?.status || 'INTAKE',
  );
  const cache = useQueryClient();
  const invalidate = useInvalidateCase(record?.id || '');
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (body: CaseInput) =>
      record ? api.updateCase(record.id, body) : api.createCase(body),
    onSuccess: async (result) => {
      await cache.invalidateQueries({ queryKey: ['cases'] });
      if (record) await invalidate();
      onClose();
      if (!record) await navigate(`/cases/${result.id}`);
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      title: title.trim(),
      caseFamily: family,
      ...(record
        ? {
            internalReference: reference.trim() || null,
            publicReference: publicReference.trim() || null,
          }
        : {
            ...(reference.trim()
              ? { internalReference: reference.trim() }
              : {}),
            ...(publicReference.trim()
              ? { publicReference: publicReference.trim() }
              : {}),
          }),
      assignment: {
        client: client.trim(),
        requestedScope: lines(scope),
        limitations: lines(limitations),
      },
      openQuestions: lines(questions),
      ...(record && status ? { status } : {}),
    });
  }
  return (
    <form onSubmit={submit}>
      <Field label="Titolo della pratica" required>
        {(id) => (
          <input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            pattern=".*\S.*"
            placeholder="Danno alla merce · riferimento incarico"
          />
        )}
      </Field>
      <div className="form-grid">
        <Field label="Riferimento interno">
          {(id) => (
            <input
              id={id}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={120}
            />
          )}
        </Field>
        <Field label="Riferimento pubblico">
          {(id) => (
            <input
              id={id}
              value={publicReference}
              onChange={(e) => setPublicReference(e.target.value)}
              maxLength={160}
            />
          )}
        </Field>
        <Field label="Famiglia della pratica">
          {(id) => (
            <select
              id={id}
              value={family}
              onChange={(e) => setFamily(e.target.value as CaseFamily)}
            >
              {Object.entries(families).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Committente">
          {(id) => (
            <input
              id={id}
              value={client}
              onChange={(e) => setClient(e.target.value)}
              maxLength={254}
            />
          )}
        </Field>
      </div>
      <Field
        label="Attività richieste"
        help="Una voce per riga, fino a 50 voci di 2000 caratteri."
      >
        {(id, helpId) => (
          <textarea
            id={id}
            aria-describedby={helpId}
            rows={3}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            maxLength={12000}
          />
        )}
      </Field>
      <Field label="Limiti dell’incarico" help="Una voce per riga.">
        {(id, helpId) => (
          <textarea
            id={id}
            aria-describedby={helpId}
            rows={2}
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
            maxLength={12000}
          />
        )}
      </Field>
      <Field label="Domande aperte" help="Una domanda per riga.">
        {(id, helpId) => (
          <textarea
            id={id}
            aria-describedby={helpId}
            rows={3}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            maxLength={12000}
          />
        )}
      </Field>
      {record && (
        <Field
          label="Stato di lavoro"
          help={
            record.status === 'APPROVED'
              ? 'La pratica torna in bozza quando ne modifichi il contenuto.'
              : 'L’approvazione avviene dalla relazione aggiornata.'
          }
        >
          {(id, helpId) => (
            <select
              id={id}
              aria-describedby={helpId}
              value={status || ''}
              onChange={(e) => setStatus(e.target.value as CaseInput['status'])}
            >
              {record.status === 'APPROVED' && (
                <option value="">
                  Approvata · torna in bozza dopo la modifica
                </option>
              )}
              {Object.entries(caseStatuses)
                .filter(([value]) => value !== 'APPROVED')
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          )}
        </Field>
      )}
      <ErrorNotice error={mutation.error} />
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
          {record ? 'Salva le modifiche' : 'Crea pratica'}
        </Button>
      </div>
    </form>
  );
}
