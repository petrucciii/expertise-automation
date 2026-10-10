import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useInvalidateCase } from '../../lib/queries';
import type { CalculationInput } from '../../lib/types';
import { sourceName } from '../../lib/labels';
import {
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  Modal,
  Notice,
} from '../../components/ui';
import { useCase } from '../cases/case-context';

export function CalculationForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Calcola da una tabella"
      description="Il risultato conserva fonte, metodo, intervallo di righe ed esclusioni."
      wide
    >
      {open && <CalculationFields onClose={onClose} />}
    </Modal>
  );
}
function CalculationFields({ onClose }: { onClose: () => void }) {
  const record = useCase();
  const sources = record.documents.filter(
    (source) =>
      ['ORIGINAL_ACCESSIBLE', 'EXCERPT_ONLY'].includes(source.availability) &&
      source.document &&
      (source.document.mimeType === 'text/csv' ||
        source.document.mimeType.includes('spreadsheetml')),
  );
  const invalidate = useInvalidateCase(record.id);
  const [source, setSource] = useState(sources[0]?.sourceCode || '');
  const [field, setField] = useState('');
  const [column, setColumn] = useState('');
  const [sheet, setSheet] = useState('');
  const [row, setRow] = useState(1);
  const [operation, setOperation] =
    useState<CalculationInput['operation']>('SUM');
  const [unit, setUnit] = useState('');
  const [group, setGroup] = useState('');
  const [decimal, setDecimal] = useState<'.' | ','>(',');
  const [thousands, setThousands] = useState('');
  const mutation = useMutation({
    mutationFn: (body: CalculationInput) =>
      api.calculate(record.id, source, body),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  if (!sources.length)
    return (
      <EmptyState title="Serve una fonte CSV o XLSX">
        Carica il file e collegalo dal registro delle fonti della pratica.
      </EmptyState>
    );
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      fieldKey: field.trim(),
      columnHeader: column.trim(),
      headerRow: row,
      operation,
      decimalSeparator: decimal,
      ...(sheet.trim() ? { worksheetName: sheet.trim() } : {}),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
      ...(group.trim() ? { comparisonGroup: group.trim() } : {}),
      ...(thousands
        ? {
            thousandsSeparator:
              thousands as CalculationInput['thousandsSeparator'],
          }
        : {}),
    });
  }
  return (
    <form onSubmit={submit}>
      <Field label="Fonte CSV o XLSX">
        {(id) => (
          <select
            id={id}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {sources.map((item) => (
              <option key={item.id} value={item.sourceCode}>
                {item.sourceCode} · {sourceName(item)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="form-grid">
        <Field label="Campo del risultato" required>
          {(id) => (
            <input
              id={id}
              value={field}
              onChange={(e) => setField(e.target.value)}
              maxLength={160}
              required
              pattern=".*\S.*"
              placeholder="temperature.mean"
            />
          )}
        </Field>
        <Field label="Intestazione della colonna" required>
          {(id) => (
            <input
              id={id}
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              maxLength={240}
              required
              pattern=".*\S.*"
            />
          )}
        </Field>
        <Field
          label="Nome del foglio (XLSX)"
          help="Lascia vuoto solo se il foglio è univoco."
        >
          {(id, helpId) => (
            <input
              id={id}
              aria-describedby={helpId}
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              maxLength={120}
            />
          )}
        </Field>
        <Field label="Riga delle intestazioni">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              max={20000}
              value={row}
              onChange={(e) => setRow(Number(e.target.value))}
              required
            />
          )}
        </Field>
        <Field label="Operazione">
          {(id) => (
            <select
              id={id}
              value={operation}
              onChange={(e) =>
                setOperation(e.target.value as CalculationInput['operation'])
              }
            >
              {Object.entries({
                SUM: 'Somma',
                MIN: 'Minimo',
                MAX: 'Massimo',
                MEAN: 'Media',
                COUNT: 'Conteggio',
                RANGE: 'Intervallo minimo / massimo',
              }).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Unità" required={operation !== 'COUNT'}>
          {(id) => (
            <input
              id={id}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required={operation !== 'COUNT'}
              maxLength={40}
              placeholder="°C, kg, EUR…"
            />
          )}
        </Field>
        <Field label="Separatore decimale">
          {(id) => (
            <select
              id={id}
              value={decimal}
              onChange={(e) => {
                const separator = e.target.value as '.' | ',';
                setDecimal(separator);
                if (thousands === separator) setThousands('');
              }}
            >
              <option value=",">Virgola (,)</option>
              <option value=".">Punto (.)</option>
            </select>
          )}
        </Field>
        <Field label="Separatore delle migliaia">
          {(id) => (
            <select
              id={id}
              value={thousands}
              onChange={(e) => setThousands(e.target.value)}
            >
              <option value="">Non presente</option>
              {['.', ',', ' ', '_']
                .filter((value) => value !== decimal)
                .map((value) => (
                  <option key={value} value={value}>
                    {value === ' ' ? 'Spazio' : value}
                  </option>
                ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Gruppo di confronto">
        {(id) => (
          <input
            id={id}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            maxLength={160}
          />
        )}
      </Field>
      <Notice>
        Formule, celle vuote e valori non numerici vengono esclusi. Il calcolo
        non esegue le formule e non ne usa il risultato memorizzato.
      </Notice>
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
          Calcola e registra
        </Button>
      </div>
    </form>
  );
}
