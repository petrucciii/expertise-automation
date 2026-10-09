import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { CaseSource, SourceLink, SourceReference } from '../../lib/types';
import { Button, Field, IconButton } from '../../components/ui';
import { DocumentReader } from '../documents/DocumentReader';
import { useCase } from '../cases/case-context';
import { sourceName } from '../../lib/labels';

export function SourceReferences({
  value,
  onChange,
}: {
  value: SourceReference[];
  onChange: (value: SourceReference[]) => void;
}) {
  const record = useCase();
  function update(index: number, update: Partial<SourceReference>) {
    onChange(
      value.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item,
      ),
    );
  }
  return (
    <fieldset className="source-fieldset">
      <legend>Riferimenti alle fonti</legend>
      {value.map((reference, index) => (
        <div key={index} className="source-reference">
          <div className="source-reference-heading">
            <span className="muted small">Fonte {index + 1}</span>
            <IconButton
              label={`Rimuovi riferimento ${index + 1}`}
              onClick={() =>
                onChange(value.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <X size={16} />
            </IconButton>
          </div>
          <div className="form-grid">
            <Field label="Fonte registrata" required>
              {(id) => (
                <select
                  id={id}
                  value={reference.sourceCode}
                  onChange={(event) =>
                    update(index, { sourceCode: event.target.value })
                  }
                  required
                >
                  <option value="">Scegli una fonte</option>
                  {record.documents
                    .filter(
                      (source) =>
                        source.sourceCode === reference.sourceCode ||
                        !value.some(
                          (item) => item.sourceCode === source.sourceCode,
                        ),
                    )
                    .map((source) => (
                      <option key={source.id} value={source.sourceCode}>
                        {source.sourceCode} · {sourceName(source)}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            <Field label="Pagina (se disponibile)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={2147483647}
                  value={reference.pageNumber || ''}
                  onChange={(event) =>
                    update(index, {
                      pageNumber: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
              )}
            </Field>
          </div>
          <Field
            label="Citazione letterale"
            help="Copia il testo esatto della fonte o della pagina scelta."
          >
            {(id, helpId) => (
              <textarea
                id={id}
                aria-describedby={helpId}
                rows={2}
                value={reference.excerpt || ''}
                maxLength={3000}
                onChange={(event) =>
                  update(index, { excerpt: event.target.value || undefined })
                }
              />
            )}
          </Field>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={value.length >= 20 || value.length >= record.documents.length}
        onClick={() => onChange([...value, { sourceCode: '' }])}
      >
        <Plus size={15} />
        Aggiungi riferimento
      </Button>
      {record.documents.length === 0 && (
        <p className="field-help">
          Registra prima una fonte nella pratica per collegare un riferimento.
        </p>
      )}
    </fieldset>
  );
}
export function SourceLinks({ links }: { links: SourceLink[] }) {
  const record = useCase();
  const [source, setSource] = useState<CaseSource | null>(null);
  return (
    <>
      <div className="source-list">
        {links.map((link) => (
          <button
            key={link.caseDocumentId}
            type="button"
            className="source-chip"
            onClick={() =>
              setSource(
                record.documents.find(
                  (item) => item.id === link.caseDocumentId,
                ) || null,
              )
            }
          >
            {link.caseDocument?.sourceCode || 'Fonte'}
            {link.pageNumber && ` · p. ${link.pageNumber}`}
          </button>
        ))}
      </div>
      {links.some((link) => link.excerpt) && (
        <details className="small muted">
          <summary>Citazioni registrate</summary>
          {links.map(
            (link) =>
              link.excerpt && (
                <blockquote
                  className="citation-quote"
                  key={link.caseDocumentId}
                >
                  {link.excerpt}
                </blockquote>
              ),
          )}
        </details>
      )}
      <DocumentReader
        source={source || undefined}
        open={Boolean(source)}
        onClose={() => setSource(null)}
      />
    </>
  );
}
