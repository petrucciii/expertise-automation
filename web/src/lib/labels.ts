import type {
  ArtifactType,
  Availability,
  CaseFamily,
  CaseStatus,
  ChecklistStatus,
  EvidenceStatus,
  EventDateType,
  ExtractionStatus,
  Json,
} from './types';

export const families: Record<CaseFamily, string> = {
  CARGO_DAMAGE: 'Danno alla merce',
  CARGO_CONTAMINATION: 'Contaminazione',
  SHORTAGE: 'Ammanco',
  TEMPERATURE_EXCURSION: 'Escursione termica',
  OTHER: 'Altra pratica',
};
export const caseStatuses: Record<CaseStatus, string> = {
  INTAKE: 'Nuova',
  IN_REVIEW: 'In revisione',
  DRAFT: 'Bozza',
  APPROVED: 'Approvata',
};
export const evidenceStatuses: Record<EvidenceStatus, string> = {
  OBSERVED: 'Osservato',
  REPORTED: 'Riportato',
  STATED_IN_DOCUMENT: 'Scritto nel documento',
  CALCULATED: 'Calcolato',
  DISPUTED: 'Contestato',
  UNKNOWN: 'Non verificato',
};
export const eventDateLabels: Record<EventDateType, string> = {
  EVENT: 'Data dell’evento',
  DOCUMENT: 'Data del documento',
  RECEIVED: 'Data di ricezione',
  UNKNOWN: 'Tipo di data non verificato',
};
export const availabilities: Record<Availability, string> = {
  ORIGINAL_ACCESSIBLE: 'Originale accessibile',
  EXCERPT_ONLY: 'Solo estratto',
  REFERENCED_NOT_ACCESSIBLE: 'Citato, non accessibile',
  NOT_PROVIDED: 'Non fornito',
};
export const checklistStatuses: Record<ChecklistStatus, string> = {
  COMPLIANT: 'Verificato',
  ISSUE_FOUND: 'Problema trovato',
  NOT_VERIFIABLE: 'Non verificabile',
  NOT_APPLICABLE: 'Non applicabile',
};
export const extractionStatuses: Record<ExtractionStatus, string> = {
  PENDING: 'Da leggere',
  EXTRACTED: 'Testo disponibile',
  NEEDS_REVIEW: 'Testo da controllare',
};
export const artifactTypes: ArtifactType[] = [
  'STRUCTURED_CASE',
  'DOCUMENT_REGISTER',
  'PRELIMINARY_REVIEW',
  'SURVEY_REPORT_DRAFT',
];
export const artifactLabels: Record<
  ArtifactType,
  { name: string; format: string; description: string }
> = {
  STRUCTURED_CASE: {
    name: 'Scheda strutturata',
    format: 'JSON',
    description: 'Dati, evidenze e riferimenti della pratica.',
  },
  DOCUMENT_REGISTER: {
    name: 'Registro documenti',
    format: 'XLSX',
    description: 'Fonti, disponibilità e metadati degli originali.',
  },
  PRELIMINARY_REVIEW: {
    name: 'Revisione preliminare',
    format: 'DOCX',
    description: 'Cronologia, differenze, verifiche e questioni aperte.',
  },
  SURVEY_REPORT_DRAFT: {
    name: 'Relazione',
    format: 'DOCX',
    description: 'Testo della relazione da rivedere e approvare.',
  },
};
export const documentTypes = [
  ['sea_waybill', 'Sea waybill'],
  ['bill_of_lading', 'Bill of lading'],
  ['cmr', 'CMR'],
  ['air_waybill', 'Air waybill'],
  ['rail_consignment', 'Lettera di vettura ferroviaria'],
  ['survey_notes', 'Note del perito'],
  ['survey_report', 'Survey report'],
  ['inspection_record', 'Verbale di ispezione'],
  ['site_inspection_notes', 'Note di sopralluogo'],
  ['warehouse_receipt', 'Ricevuta magazzino'],
  ['temperature_log', 'Logger temperature'],
  ['claim_email', 'Email di reclamo'],
  ['court_order', 'Ordine giudiziario'],
  ['invoice', 'Fattura'],
  ['packing_list', 'Packing list'],
  ['photograph', 'Fotografia'],
  ['other', 'Altro'],
] as const;
export function formatDate(date?: string | null, withTime = false): string {
  if (!date) return 'Data non verificata';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat(
        'it-IT',
        withTime
          ? { dateStyle: 'short', timeStyle: 'short' }
          : { dateStyle: 'medium' },
      ).format(parsed);
}
export function displayValue(value: Json | undefined): string {
  if (value === undefined || value === null) return 'Non verificato';
  if (typeof value === 'number')
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 }).format(
      value,
    );
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
export function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
export function sourceName(source: {
  displayName: string | null;
  sourceCode: string;
  document?: { fileName: string } | null;
}): string {
  return source.displayName || source.document?.fileName || source.sourceCode;
}
