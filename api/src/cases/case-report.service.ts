import { Injectable } from '@nestjs/common';
import { CasesService } from './cases.service.js';

@Injectable()
export class CaseReportService {
  constructor(private readonly cases: CasesService) {}

  async generate(caseId: string, ownerId: number) {
    const record = await this.cases.get(caseId, ownerId);
    const sourcedEvidence = record.evidence
      .filter((item) => item.epistemicStatus !== 'UNKNOWN')
      .map((item) => {
        const sources = item.sourceLinks.map((source) => ({
          sourceCode: source.caseDocument.sourceCode,
          pageNumber: source.pageNumber,
          excerpt: source.excerpt,
        }));
        return {
          evidenceId: item.id,
          fieldKey: item.fieldKey,
          text: phraseForEvidence(item),
          epistemicStatus: item.epistemicStatus,
          attribution: item.attribution,
          sources,
        };
      });

    const chronology = record.events.map((event) => {
      const sources = event.sourceLinks.map((source) => ({
        sourceCode: source.caseDocument.sourceCode,
        pageNumber: source.pageNumber,
        excerpt: source.excerpt,
      }));
      return {
        event: event.event,
        date: event.date,
        dateType: event.dateType,
        epistemicStatus: event.epistemicStatus,
        text: phraseForEvent(
          event,
          sources.map((source) => source.sourceCode),
        ),
        sources,
      };
    });

    return {
      schemaVersion: '1.0',
      templateId: record.reportTemplateId,
      templateVersion: record.clicheSetVersion ?? '1.0',
      status: 'DRAFT_REQUIRES_SURVEYOR_REVIEW',
      caseId: record.id,
      title: record.title,
      sections: [
        {
          id: 'scope-and-limitations',
          heading: 'Oggetto e limiti della bozza',
          paragraphs: [
            'Questa bozza è stata composta esclusivamente con i dati strutturati e le fonti registrate nella pratica. Non costituisce un accertamento diretto né una perizia finale.',
            ...record.documents
              .filter(
                (document) => document.availability !== 'ORIGINAL_ACCESSIBLE',
              )
              .map(
                (document) =>
                  `Per ${document.sourceCode} (${document.displayName ?? document.document?.fileName ?? 'documento non identificato'}) è registrata la disponibilità “${document.availability}”.`,
              ),
          ],
          sourceCodes: record.documents.map((document) => document.sourceCode),
        },
        {
          id: 'shipment-and-cargo',
          heading: 'Merce e trasporto',
          paragraphs: sourcedEvidence
            .filter((item) =>
              /shipment|cargo|transport|container|vessel|origin|destination/i.test(
                item.fieldKey,
              ),
            )
            .map((item) => item.text),
          sourceCodes: sourceCodesForEvidence(
            sourcedEvidence,
            /shipment|cargo|transport|container|vessel|origin|destination/i,
          ),
          emptyText:
            'Non sono registrati dati di spedizione o merce con riferimenti alle fonti. I campi inseriti nella scheda pratica restano da verificare.',
        },
        {
          id: 'documented-events',
          heading: 'Eventi documentati',
          paragraphs: chronology.map((event) => event.text),
          sourceCodes: unique(
            chronology.flatMap((event) =>
              event.sources.map((source) => source.sourceCode),
            ),
          ),
          emptyText: 'Non è stata ancora registrata una cronologia con fonti.',
        },
        {
          id: 'damage-and-observations',
          heading: 'Danno e rilievi',
          paragraphs: sourcedEvidence
            .filter((item) =>
              /damage|observation|condition|loss|quantity|temperature|cause/i.test(
                item.fieldKey,
              ),
            )
            .map((item) => item.text),
          sourceCodes: sourceCodesForEvidence(
            sourcedEvidence,
            /damage|observation|condition|loss|quantity|temperature|cause/i,
          ),
          emptyText:
            'Non sono disponibili rilievi o dati sul danno collegati a fonti. Non viene formulata una conclusione tecnica.',
        },
        {
          id: 'economic-assessment',
          heading: 'Valutazione economica',
          paragraphs: sourcedEvidence
            .filter((item) =>
              /claim|amount|value|cost|salvage|disposal|limit|quantification/i.test(
                item.fieldKey,
              ),
            )
            .map((item) => item.text),
          sourceCodes: sourceCodesForEvidence(
            sourcedEvidence,
            /claim|amount|value|cost|salvage|disposal|limit|quantification/i,
          ),
          emptyText:
            'Con i dati strutturati e le fonti registrate non è possibile quantificare il danno o verificare eventuali recuperi.',
        },
        {
          id: 'open-questions',
          heading: 'Questioni aperte',
          paragraphs: record.openQuestions,
          sourceCodes: [],
          emptyText: 'Nessuna questione aperta è stata registrata.',
        },
      ],
      evidenceLedger: sourcedEvidence,
      chronology,
      reviewerNotice:
        'The surveyor must check every statement against its source, resolve open issues, and approve the text before external use.',
    };
  }
}

function phraseForEvidence(item: {
  fieldKey: string;
  value: unknown;
  unit: string | null;
  epistemicStatus: string;
  attribution: string | null;
  sourceLinks: Array<{ caseDocument: { sourceCode: string } }>;
}): string {
  const value = displayValue(item.value, item.unit);
  const sourceCodes = unique(
    item.sourceLinks.map((source) => source.caseDocument.sourceCode),
  );
  const references = sourceCodes.length
    ? sourceCodes.join(', ')
    : 'fonte non indicata';

  switch (item.epistemicStatus) {
    case 'OBSERVED':
      return `La documentazione ${references} registra un rilievo del perito: ${value}.`;
    case 'REPORTED':
      return `${item.attribution ?? 'Una parte'} riferisce, secondo ${references}, che ${value}.`;
    case 'STATED_IN_DOCUMENT':
      return `Il documento ${references} riporta: ${value}.`;
    case 'CALCULATED':
      return `La pratica registra il valore calcolato ${value}, con riferimento a ${references}; il sistema non ha ricalcolato il dato.`;
    case 'DISPUTED':
      return `È registrata una contestazione relativa a ${value}, richiamata in ${references}.`;
    default:
      return `${item.fieldKey}: dato non verificato.`;
  }
}

function phraseForEvent(
  event: {
    event: string;
    date: Date | null;
    dateType: string;
    epistemicStatus: string;
  },
  sourceCodes: string[],
): string {
  const references = sourceCodes.length
    ? sourceCodes.join(', ')
    : 'fonte non indicata';
  const datePrefix = event.date
    ? `${event.date.toISOString().slice(0, 10)}: `
    : '';
  switch (event.epistemicStatus) {
    case 'OBSERVED':
      return `${datePrefix}La registrazione ${references} riporta un evento osservato: ${event.event}`;
    case 'REPORTED':
      return `${datePrefix}La fonte ${references} riferisce che ${event.event}`;
    case 'STATED_IN_DOCUMENT':
      return `${datePrefix}Il documento ${references} riporta che ${event.event}`;
    case 'CALCULATED':
      return `${datePrefix}La cronologia registra come calcolato l'evento “${event.event}”, sulla base di ${references}`;
    case 'DISPUTED':
      return `${datePrefix}L'evento “${event.event}” è registrato come contestato in ${references}`;
    default:
      return `${datePrefix}La registrazione dell'evento “${event.event}” non è verificata.`;
  }
}

function sourceCodesForEvidence(
  evidence: Array<{ fieldKey: string; sources: Array<{ sourceCode: string }> }>,
  fieldPattern: RegExp,
): string[] {
  return unique(
    evidence
      .filter((item) => fieldPattern.test(item.fieldKey))
      .flatMap((item) => item.sources.map((source) => source.sourceCode)),
  );
}

function displayValue(value: unknown, unit: string | null): string {
  const raw =
    typeof value === 'string'
      ? value
      : (JSON.stringify(value, null, 0) ?? 'dato non disponibile');
  return unit ? `${raw} ${unit}` : raw;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
