import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { parseJsonInput } from '../../lib/json-input';
import {
  isObject,
  reportSections,
  stringArray,
} from '../../lib/artifact-content';
import { lines } from '../../lib/labels';
import { useInvalidateCase } from '../../lib/queries';
import type { Artifact, JsonObject, ReportSection } from '../../lib/types';
import {
  Button,
  ErrorNotice,
  Field,
  IconButton,
  Notice,
} from '../../components/ui';
import { useCase } from '../cases/case-context';

export function ArtifactEditor({
  artifact,
  onSaved,
  onCancel,
}: {
  artifact: Artifact;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const record = useCase();
  const invalidate = useInvalidateCase(record.id);
  const [baseContent, setBaseContent] = useState(artifact.content);
  const [sections, setSections] = useState(reportSections(artifact.content));
  const [questions, setQuestions] = useState(
    stringArray(artifact.content.openQuestions).join('\n'),
  );
  const [limitations, setLimitations] = useState(
    stringArray(artifact.content.limitations).join('\n'),
  );
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState(JSON.stringify(artifact.content, null, 2));
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: async (content: JsonObject) => {
      const latest = await api.latestArtifact(record.id, artifact.type);
      if (latest.id !== artifact.id || latest.isStale)
        throw new ApiError(
          409,
          'La versione aperta nell’editor non è più corrente. Copia le modifiche prima di ricaricare.',
        );
      return api.saveRevision(record.id, artifact.type, content, artifact.id);
    },
    onSuccess: async () => {
      await invalidate();
      onSaved();
    },
  });
  function update(index: number, values: Partial<ReportSection>) {
    setSections(
      sections.map((section, sectionIndex) =>
        index === sectionIndex ? { ...section, ...values } : section,
      ),
    );
  }
  function structuredContent(): JsonObject {
    return artifact.type === 'SURVEY_REPORT_DRAFT'
      ? {
          ...baseContent,
          sections: sections.map((section) => ({ ...section })),
        }
      : {
          ...baseContent,
          openQuestions: lines(questions),
          limitations: lines(limitations),
        };
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const content: unknown = advanced
        ? parseJsonInput(json)
        : structuredContent();
      if (!isObject(content))
        throw new Error('La revisione deve contenere un oggetto strutturato.');
      if (
        new TextEncoder().encode(
          JSON.stringify({ content, expectedArtifactId: artifact.id }),
        ).byteLength >
        100 * 1024
      )
        throw new Error(
          'La revisione supera il limite di 100 KiB della richiesta. Riduci il testo oppure conserva una versione più breve.',
        );
      mutation.mutate(content);
    } catch (cause) {
      setError(cause);
    }
  }
  return (
    <form className="artifact-editor" onSubmit={submit}>
      <h3>Modifica il testo · versione {artifact.version}</h3>
      <Notice>
        Il salvataggio crea una nuova bozza e conserva questa versione nello
        storico. Mantieni le fonti nelle sezioni che contengono affermazioni sui
        fatti.
      </Notice>
      <label className="check-option">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(event) => {
            if (event.target.checked)
              setJson(JSON.stringify(structuredContent(), null, 2));
            else {
              try {
                const parsed = parseJsonInput(json);
                if (!isObject(parsed)) throw new Error('Contenuto non valido.');
                // Keep fields edited in JSON when returning to the structured editor.
                setBaseContent(parsed);
                setSections(reportSections(parsed));
                setQuestions(stringArray(parsed.openQuestions).join('\n'));
                setLimitations(stringArray(parsed.limitations).join('\n'));
              } catch (cause) {
                setError(cause);
                return;
              }
            }
            setError(null);
            setAdvanced(event.target.checked);
          }}
        />
        <span>
          Editor del contenuto completo
          <small>
            Per modificare anche cronologia, verifiche e suggerimenti della
            narrativa.
          </small>
        </span>
      </label>
      {advanced ? (
        <Field label="Contenuto della revisione (JSON)">
          {(id) => (
            <textarea
              id={id}
              className="mono"
              rows={18}
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
          )}
        </Field>
      ) : artifact.type === 'SURVEY_REPORT_DRAFT' ? (
        <>
          {sections.map((section, index) => (
            <section className="report-section" key={section.id}>
              <div className="record-heading">
                <p className="mono muted">{section.id}</p>
                <IconButton
                  label={`Rimuovi sezione ${section.heading}`}
                  disabled={sections.length <= 1}
                  onClick={() =>
                    setSections(
                      sections.filter(
                        (_, sectionIndex) => sectionIndex !== index,
                      ),
                    )
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
              <Field label="Titolo della sezione">
                {(id) => (
                  <input
                    id={id}
                    value={section.heading}
                    onChange={(event) =>
                      update(index, { heading: event.target.value })
                    }
                    maxLength={240}
                  />
                )}
              </Field>
              <Field
                label="Paragrafi"
                help="Separa i paragrafi con una riga vuota."
              >
                {(id, helpId) => (
                  <textarea
                    id={id}
                    aria-describedby={helpId}
                    rows={Math.min(
                      10,
                      Math.max(3, section.paragraphs.length * 2),
                    )}
                    value={section.paragraphs.join('\n\n')}
                    onChange={(event) =>
                      update(index, {
                        paragraphs: event.target.value.split(/\n\s*\n/),
                      })
                    }
                    maxLength={60000}
                  />
                )}
              </Field>
              <fieldset className="source-fieldset">
                <legend>Fonti della sezione</legend>
                <div className="check-option-list">
                  {record.documents.map((source) => (
                    <label className="check-option" key={source.id}>
                      <input
                        type="checkbox"
                        checked={section.sourceCodes.includes(
                          source.sourceCode,
                        )}
                        disabled={
                          !section.sourceCodes.includes(source.sourceCode) &&
                          section.sourceCodes.length >= 20
                        }
                        onChange={(event) =>
                          update(index, {
                            sourceCodes: event.target.checked
                              ? [...section.sourceCodes, source.sourceCode]
                              : section.sourceCodes.filter(
                                  (code) => code !== source.sourceCode,
                                ),
                          })
                        }
                      />
                      <span>
                        {source.sourceCode} ·{' '}
                        {source.displayName ||
                          source.document?.fileName ||
                          'Fonte registrata'}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={sections.length >= 100}
            onClick={() =>
              setSections([
                ...sections,
                {
                  id: `section-${crypto.randomUUID()}`,
                  heading: 'Nuova sezione',
                  paragraphs: [''],
                  sourceCodes: [],
                },
              ])
            }
          >
            <Plus size={15} />
            Aggiungi sezione
          </Button>
        </>
      ) : (
        <>
          <Field label="Questioni aperte" help="Una domanda per riga.">
            {(id, helpId) => (
              <textarea
                id={id}
                aria-describedby={helpId}
                rows={5}
                value={questions}
                onChange={(event) => setQuestions(event.target.value)}
                maxLength={20000}
              />
            )}
          </Field>
          <Field label="Limiti della revisione" help="Un limite per riga.">
            {(id, helpId) => (
              <textarea
                id={id}
                aria-describedby={helpId}
                rows={5}
                value={limitations}
                onChange={(event) => setLimitations(event.target.value)}
                maxLength={20000}
              />
            )}
          </Field>
          <p className="field-help">
            Per le altre voci usa l’editor del contenuto completo; i riferimenti
            esistenti vengono conservati.
          </p>
        </>
      )}
      <ErrorNotice error={error || mutation.error} />
      <div className="form-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={onCancel}
        >
          Annulla modifica
        </Button>
        <Button type="submit" busy={mutation.isPending}>
          Salva nuova versione
        </Button>
      </div>
    </form>
  );
}
