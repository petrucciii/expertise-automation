import { useState } from 'react';
import type { CaseSource, Json, JsonObject } from '../../lib/types';
import { isObject, reportSections } from '../../lib/artifact-content';
import { displayValue } from '../../lib/labels';
import { Badge, Notice } from '../../components/ui';
import { useCase } from '../cases/case-context';
import { DocumentReader } from '../documents/DocumentReader';

export function ArtifactViewer({ content }: { content: JsonObject }) {
  const record = useCase();
  const [source, setSource] = useState<CaseSource | null>(null);
  const sections = reportSections(content);
  return (
    <>
      {sections.length ? (
        <>
          {sections.map((section) => (
            <section className="report-section" key={section.id}>
              <h3>{section.heading}</h3>
              {section.paragraphs.length ? (
                section.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))
              ) : (
                <p className="muted">
                  {section.emptyText || 'Nessun testo in questa sezione.'}
                </p>
              )}
              <div className="source-list">
                {section.sourceCodes.map((code) => (
                  <button
                    type="button"
                    key={code}
                    className="source-chip"
                    onClick={() =>
                      setSource(
                        record.documents.find(
                          (item) => item.sourceCode === code,
                        ) || null,
                      )
                    }
                  >
                    {code}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {content.aiSuggestions && (
            <section className="report-section">
              <h3>Suggerimenti dell’assistente</h3>
              <Notice>
                Questi testi restano proposte da verificare. Non sostituiscono
                le evidenze o la revisione del perito.
              </Notice>
              <ContentTree value={content.aiSuggestions} />
            </section>
          )}
          <details className="record-body">
            <summary>Registro di supporto e contenuto completo</summary>
            <pre>{JSON.stringify(content, null, 2)}</pre>
          </details>
        </>
      ) : (
        <ContentTree value={content} />
      )}
      <DocumentReader
        source={source || undefined}
        open={Boolean(source)}
        onClose={() => setSource(null)}
      />
    </>
  );
}
const labels: Record<string, string> = {
  chronology: 'Cronologia',
  computedChecks: 'Controlli deterministici',
  surveyorChecklist: 'Checklist del perito',
  openQuestions: 'Questioni aperte',
  limitations: 'Limiti della revisione',
  aiSuggestions: 'Suggerimenti AI da verificare',
  comparableValueDifferences: 'Differenze tra valori comparabili',
  unavailableSources: 'Fonti non disponibili',
  documents: 'Registro delle fonti',
  assignment: 'Incarico',
  shipment: 'Merce e trasporto',
  parties: 'Soggetti',
  observations: 'Evidenze',
  damage_assessment: 'Danno e valutazioni',
  events: 'Eventi',
  issues: 'Verifiche',
  open_questions: 'Questioni aperte',
  sourceCode: 'Fonte',
  source_code: 'Fonte',
  sourceCodes: 'Fonti',
  fieldKey: 'Campo',
  field: 'Campo',
  value: 'Valore',
  unit: 'Unità',
  attribution: 'Attribuzione',
  explanation: 'Spiegazione',
  suggestedCheck: 'Controllo suggerito',
  suggested_check: 'Controllo suggerito',
  concern: 'Punto da verificare',
  alternativeExplanation: 'Spiegazione alternativa',
  status: 'Stato',
  title: 'Titolo',
  date: 'Data',
  event: 'Evento',
  source_refs: 'Riferimenti',
  sources: 'Fonti',
  evidenceIds: 'Evidenze collegate',
  document: 'Documento',
  availability: 'Disponibilità',
  filename: 'Nome file',
  documentType: 'Tipo documento',
  client: 'Committente',
  requested_scope: 'Attività richieste',
  epistemicStatus: 'Stato della prova',
  epistemic_status: 'Stato della prova',
  excerpt: 'Citazione',
  pageNumber: 'Pagina',
  page_number: 'Pagina',
  comparison_group: 'Gruppo di confronto',
  paragraph: 'Paragrafo proposto',
  description: 'Descrizione',
  source_status: 'Origine',
  sha256: 'SHA-256',
  economic_assessment: 'Valutazione economica',
  generatedAt: 'Data di generazione',
  reviewerNotice: 'Nota per il revisore',
  verificationPurpose: 'Finalità della verifica',
  senderOrAuthor: 'Autore o mittente',
  documentDate: 'Data del documento',
  extractionStatus: 'Testo estratto',
  severity: 'Severità',
  ruleId: 'Regola',
  ruleVersion: 'Versione della regola',
};
function ContentTree({ value, depth = 0 }: { value: Json; depth?: number }) {
  if (depth > 6) return <pre>{JSON.stringify(value, null, 2)}</pre>;
  if (value === null)
    return <span className="muted small">Non verificato</span>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="content-tree-list">
        {value.map((item, index) => (
          <div className="content-tree-item" key={index}>
            <ContentTree value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    ) : (
      <p className="small muted">Nessuna voce registrata.</p>
    );
  if (isObject(value))
    return (
      <dl className={`content-tree ${depth === 0 ? 'content-tree-root' : ''}`}>
        {Object.entries(value)
          .filter(
            ([key]) =>
              depth > 0 ||
              ![
                'schemaVersion',
                'caseId',
                'schema_version',
                'case_id',
              ].includes(key),
          )
          .map(([key, item]) => (
            <div key={key}>
              <dt>{labels[key] || key.replaceAll('_', ' ')}</dt>
              <dd>
                <ContentTree value={item} depth={depth + 1} />
              </dd>
            </div>
          ))}
      </dl>
    );
  if (
    typeof value === 'string' &&
    /^(OBSERVED|REPORTED|STATED_IN_DOCUMENT|CALCULATED|DISPUTED|UNKNOWN|COMPLIANT|ISSUE_FOUND|NOT_VERIFIABLE|NOT_APPLICABLE|ORIGINAL_ACCESSIBLE|EXCERPT_ONLY|REFERENCED_NOT_ACCESSIBLE|NOT_PROVIDED)$/i.test(
      value,
    )
  )
    return <Badge value={value.toUpperCase()} />;
  return <span className="content-tree-value">{displayValue(value)}</span>;
}
