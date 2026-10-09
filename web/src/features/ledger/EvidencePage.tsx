import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calculator, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { displayValue, evidenceStatuses } from '../../lib/labels';
import { useInvalidateCase } from '../../lib/queries';
import type { EvidenceInput, Json, SourceReference } from '../../lib/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  Modal,
  Notice,
  PageTitle,
} from '../../components/ui';
import { useCase } from '../cases/case-context';
import { SourceLinks, SourceReferences } from './SourceReferences';
import { CalculationForm } from './CalculationForm';

export default function EvidencePage() {
  const record = useCase();
  const [adding, setAdding] = useState(false);
  const [calculating, setCalculating] = useState(false);
  return (
    <div className="page-container">
      <PageTitle
        title="Evidenze"
        description="Valori, dichiarazioni e rilievi con stato, attribuzione e fonti."
        action={
          <>
            <Button variant="secondary" onClick={() => setCalculating(true)}>
              <Calculator size={16} />
              Calcola da tabella
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} />
              Aggiungi evidenza
            </Button>
          </>
        }
      />
      {record.evidence.length === 0 && (
        <EmptyState title="Ogni dato ha una provenienza">
          Accetta una proposta dalle fonti oppure registra manualmente
          un’evidenza con i suoi riferimenti.
        </EmptyState>
      )}
      <div className="record-list">
        {record.evidence.map((item) => (
          <article className="record-card" key={item.id}>
            <div className="record-heading">
              <h3>{item.fieldKey}</h3>
              <Badge value={item.epistemicStatus} />
            </div>
            <p className="record-body">
              {displayValue(item.value)}
              {item.unit && ` ${item.unit}`}
            </p>
            <div className="record-meta">
              {item.attribution && <span>Attribuito a {item.attribution}</span>}
              {item.comparisonGroup && (
                <span>Gruppo di confronto: {item.comparisonGroup}</span>
              )}
            </div>
            <SourceLinks links={item.sourceLinks} />
            {item.calculationMetadata && (
              <details className="record-body">
                <summary>Metodo e dati del calcolo</summary>
                <pre>{JSON.stringify(item.calculationMetadata, null, 2)}</pre>
              </details>
            )}
          </article>
        ))}
      </div>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Aggiungi un’evidenza"
        description="Registra il dato senza perdere lo stato della prova e il riferimento alla fonte."
        wide
      >
        {adding && <EvidenceFields onClose={() => setAdding(false)} />}
      </Modal>
      <CalculationForm
        open={calculating}
        onClose={() => setCalculating(false)}
      />
    </div>
  );
}
function EvidenceFields({ onClose }: { onClose: () => void }) {
  const record = useCase();
  const invalidate = useInvalidateCase(record.id);
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [valueType, setValueType] = useState<'text' | 'number' | 'json'>(
    'text',
  );
  const [unit, setUnit] = useState('');
  const [group, setGroup] = useState('');
  const [status, setStatus] =
    useState<EvidenceInput['epistemicStatus']>('STATED_IN_DOCUMENT');
  const [attribution, setAttribution] = useState('');
  const [sources, setSources] = useState<SourceReference[]>([]);
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: (body: EvidenceInput) => api.addEvidence(record.id, body),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      let parsed: Json = value.trim();
      if (valueType === 'number') {
        const normalized = value.trim().replace(',', '.');
        if (
          !normalized ||
          !/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(normalized) ||
          !Number.isFinite(Number(normalized))
        )
          throw new Error(
            'Inserisci un numero senza separatori delle migliaia.',
          );
        parsed = Number(normalized);
      }
      if (valueType === 'json') parsed = JSON.parse(value) as Json;
      if (status !== 'UNKNOWN' && !sources.length)
        throw new Error(
          'Collega almeno una fonte oppure indica che il dato non è verificato.',
        );
      mutation.mutate({
        fieldKey: field.trim(),
        value: parsed,
        epistemicStatus: status,
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        ...(group.trim() ? { comparisonGroup: group.trim() } : {}),
        ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
        sources,
      });
    } catch (cause) {
      setError(cause);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field
        label="Campo"
        required
        help="Un nome riconoscibile, per esempio cargo.cartons oppure container.weight."
      >
        {(id, helpId) => (
          <input
            id={id}
            aria-describedby={helpId}
            value={field}
            onChange={(e) => setField(e.target.value)}
            maxLength={160}
            required
            pattern=".*\S.*"
          />
        )}
      </Field>
      <div className="form-grid">
        <Field label="Tipo del valore">
          {(id) => (
            <select
              id={id}
              value={valueType}
              onChange={(e) => setValueType(e.target.value as typeof valueType)}
            >
              <option value="text">Testo</option>
              <option value="number">Numero</option>
              <option value="json">Valore strutturato (JSON)</option>
            </select>
          )}
        </Field>
        <Field label="Stato della prova">
          {(id) => (
            <select
              id={id}
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as EvidenceInput['epistemicStatus'])
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
      </div>
      <Field label="Valore" required={status !== 'UNKNOWN'}>
        {(id) => (
          <textarea
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            maxLength={16000}
            required={status !== 'UNKNOWN'}
          />
        )}
      </Field>
      <div className="form-grid">
        <Field label="Unità">
          {(id) => (
            <input
              id={id}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={40}
              placeholder="kg, colli, pallet, USD…"
            />
          )}
        </Field>
        <Field
          label="Gruppo di confronto"
          help="Distingui container, lotto e ambito: evita confronti tra quantità diverse."
        >
          {(id, helpId) => (
            <input
              id={id}
              aria-describedby={helpId}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              maxLength={160}
            />
          )}
        </Field>
      </div>
      <Field label="Attribuzione">
        {(id) => (
          <input
            id={id}
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            maxLength={240}
            placeholder="Persona o soggetto che riporta il dato"
          />
        )}
      </Field>
      {status === 'OBSERVED' && (
        <Notice tone="warning">
          Un rilievo osservato richiede note del perito o un verbale d’ispezione
          accessibile. Email e ordini giudiziari non attestano da soli
          un’osservazione diretta.
        </Notice>
      )}
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
          Registra evidenza
        </Button>
      </div>
    </form>
  );
}
