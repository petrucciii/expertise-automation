import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarDays, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import {
  evidenceStatuses,
  formatDate,
  eventDateLabels as dateLabels,
} from '../../lib/labels';
import { useInvalidateCase } from '../../lib/queries';
import type {
  EventDateType,
  EventInput,
  SourceReference,
} from '../../lib/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  Modal,
  PageTitle,
} from '../../components/ui';
import { useCase } from '../cases/case-context';
import { SourceLinks, SourceReferences } from './SourceReferences';

export default function TimelinePage() {
  const record = useCase();
  const [adding, setAdding] = useState(false);
  return (
    <div className="page-container">
      <PageTitle
        title="Cronologia"
        description="Eventi e date, mantenendo il significato della data e l’attribuzione della dichiarazione."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} />
            Aggiungi evento
          </Button>
        }
      />
      {record.events.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="Ricostruisci la sequenza degli eventi"
        >
          Accetta gli eventi dalle proposte oppure registrali con i riferimenti
          alle fonti.
        </EmptyState>
      )}
      <div className="timeline">
        {record.events.map((item) => (
          <article className="timeline-item" key={item.id}>
            <div className="timeline-date">
              {formatDate(item.date)} · {dateLabels[item.dateType]}
            </div>
            <div className="record-card">
              <div className="record-heading">
                <h3>{item.event}</h3>
                <Badge value={item.epistemicStatus} />
              </div>
              {item.attribution && (
                <p className="record-meta">Attribuito a {item.attribution}</p>
              )}
              <SourceLinks links={item.sourceLinks} />
            </div>
          </article>
        ))}
      </div>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Aggiungi un evento"
        description="Distingui la data dell’evento da quella del documento o della ricezione."
        wide
      >
        {adding && <EventFields onClose={() => setAdding(false)} />}
      </Modal>
    </div>
  );
}
function EventFields({ onClose }: { onClose: () => void }) {
  const record = useCase();
  const invalidate = useInvalidateCase(record.id);
  const [event, setEvent] = useState('');
  const [date, setDate] = useState('');
  const [dateType, setDateType] = useState<EventDateType>('UNKNOWN');
  const [status, setStatus] =
    useState<EventInput['epistemicStatus']>('STATED_IN_DOCUMENT');
  const [attribution, setAttribution] = useState('');
  const [sources, setSources] = useState<SourceReference[]>([]);
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: (body: EventInput) => api.addEvent(record.id, body),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (status !== 'UNKNOWN' && sources.length === 0) {
      setError(
        new Error(
          'Collega almeno una fonte oppure indica lo stato non verificato.',
        ),
      );
      return;
    }
    mutation.mutate({
      event: event.trim(),
      dateType,
      epistemicStatus: status,
      ...(date ? { date } : {}),
      ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
      sources,
    });
  }
  return (
    <form onSubmit={submit}>
      <Field label="Evento" required>
        {(id) => (
          <textarea
            id={id}
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            rows={3}
            required
            maxLength={4000}
          />
        )}
      </Field>
      <div className="form-grid">
        <Field label="Data">
          {(id) => (
            <input
              id={id}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Significato della data">
          {(id) => (
            <select
              id={id}
              value={dateType}
              onChange={(e) => setDateType(e.target.value as EventDateType)}
            >
              {Object.entries(dateLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Stato della prova">
          {(id) => (
            <select
              id={id}
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as EventInput['epistemicStatus'])
              }
            >
              {Object.entries(evidenceStatuses)
                .filter(([key]) => key !== 'CALCULATED')
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label="Attribuzione">
          {(id) => (
            <input
              id={id}
              value={attribution}
              onChange={(e) => setAttribution(e.target.value)}
              maxLength={240}
            />
          )}
        </Field>
      </div>
      <SourceReferences value={sources} onChange={setSources} />
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
          Registra evento
        </Button>
      </div>
    </form>
  );
}
