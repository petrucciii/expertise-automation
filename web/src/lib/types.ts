export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type User = { id: number; email: string };
export type CaseFamily =
  | 'CARGO_DAMAGE'
  | 'CARGO_CONTAMINATION'
  | 'SHORTAGE'
  | 'TEMPERATURE_EXCURSION'
  | 'OTHER';
export type CaseStatus = 'INTAKE' | 'IN_REVIEW' | 'DRAFT' | 'APPROVED';
export type EvidenceStatus =
  | 'OBSERVED'
  | 'REPORTED'
  | 'STATED_IN_DOCUMENT'
  | 'CALCULATED'
  | 'DISPUTED'
  | 'UNKNOWN';
export type Availability =
  | 'ORIGINAL_ACCESSIBLE'
  | 'EXCERPT_ONLY'
  | 'REFERENCED_NOT_ACCESSIBLE'
  | 'NOT_PROVIDED';
export type ChecklistStatus =
  'COMPLIANT' | 'ISSUE_FOUND' | 'NOT_VERIFIABLE' | 'NOT_APPLICABLE';
export type ArtifactType =
  | 'STRUCTURED_CASE'
  | 'DOCUMENT_REGISTER'
  | 'PRELIMINARY_REVIEW'
  | 'SURVEY_REPORT_DRAFT';
export type EventDateType = 'EVENT' | 'DOCUMENT' | 'RECEIVED' | 'UNKNOWN';
export type ExtractionStatus = 'PENDING' | 'EXTRACTED' | 'NEEDS_REVIEW';

export interface CaseSummary {
  id: string;
  title: string;
  internalReference: string | null;
  publicReference: string | null;
  caseFamily: CaseFamily;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}
export interface Assignment {
  client?: string;
  requestedScope?: string[];
  limitations?: string[];
  enteredByUser?: boolean;
}
export interface DocumentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  extractionStatus: ExtractionStatus;
  extractionTruncated: boolean;
  extractionReviewedAt: string | null;
  created_at: string;
  hash?: string;
  sourceMetadata?: Json;
}
export interface CaseSource {
  id: string;
  caseId: string;
  documentId: string | null;
  sourceCode: string;
  displayName: string | null;
  documentType: string | null;
  verificationPurpose: string | null;
  excerptText: string | null;
  documentDate: string | null;
  senderOrAuthor: string | null;
  availability: Availability;
  metadata: Json;
  attachedAt: string;
  document: DocumentRecord | null;
}
export interface SourceReference {
  sourceCode: string;
  pageNumber?: number;
  excerpt?: string;
}
export interface SourceLink {
  caseDocumentId: string;
  pageNumber: number | null;
  excerpt: string | null;
  caseDocument: { id?: string; sourceCode: string };
}
export interface Evidence {
  id: string;
  fieldKey: string;
  value: Json;
  unit: string | null;
  comparisonGroup: string | null;
  epistemicStatus: EvidenceStatus;
  attribution: string | null;
  sourceLinks: SourceLink[];
  calculationMetadata: Json;
  createdAt: string;
}
export interface CaseEvent {
  id: string;
  event: string;
  date: string | null;
  dateType: EventDateType;
  epistemicStatus: EvidenceStatus;
  attribution: string | null;
  sourceLinks: SourceLink[];
}
export interface CaseIssue {
  id: string;
  status: ChecklistStatus;
  title: string;
  explanation: string;
  severity: string | null;
  suggestedCheck: string | null;
  ruleId: string | null;
  ruleVersion: string | null;
  evidence: Array<{ evidenceId: string; evidence?: Evidence }>;
}
export interface CaseRecord extends CaseSummary {
  revision: number;
  assignment: Assignment | null;
  openQuestions: string[];
  documents: CaseSource[];
  evidence: Evidence[];
  events: CaseEvent[];
  issues: CaseIssue[];
  reportTemplateId: string;
  clicheSetVersion: string | null;
}
export interface DocumentContent {
  documentId: string;
  content: string;
  pages: Array<{ pageNumber: number; text: string }> | null;
  extractionStatus: ExtractionStatus;
  extractionTruncated: boolean;
  extractionReviewedAt: string | null;
  sourceMetadata: Json;
}
export interface DocumentRegisterEntry {
  id: string;
  sourceCode: string;
  document: string | null;
  documentType: string | null;
  verificationPurpose: string | null;
  excerptText: string | null;
  availability: Availability;
  sha256: string | null;
  documentDate: string | null;
  senderOrAuthor: string | null;
  metadata: Json;
  emailMetadata: Json;
  attachedAt: string;
}
export interface SuggestionContent {
  fieldKey?: string;
  valueText?: string;
  numericValue?: number | null;
  event?: string;
  date?: string | null;
  dateType?: EventDateType;
  unit?: string | null;
  comparisonGroup?: string | null;
  epistemicStatus?: EvidenceStatus;
  attribution?: string | null;
  excerpt?: string;
  pageNumber?: number | null;
  description?: string;
}
export interface Suggestion {
  id: string;
  kind: 'FACT' | 'EVENT' | 'IMAGE_DESCRIPTION';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  content: SuggestionContent;
}
export interface Proposal {
  id: string;
  caseDocumentId: string;
  caseDocument: CaseSource;
  documentType: string;
  status: 'PENDING' | 'REVIEWED' | 'REJECTED';
  suggestions: Suggestion[];
  openQuestions: string[];
  createdAt: string;
  reviewedAt: string | null;
  model: string;
}
export interface Citation {
  id: string;
  documentId: string | null;
  caseDocumentId: string | null;
  pageNumber: number | null;
  excerpt: string;
  document?: Pick<DocumentRecord, 'id' | 'fileName' | 'mimeType'> | null;
  caseDocument?: Pick<
    CaseSource,
    'id' | 'sourceCode' | 'displayName' | 'availability'
  > | null;
}
export interface Message {
  id: string;
  role: 'USER' | 'AI' | 'ASSISTANT';
  content: string;
  created_at: string;
  sources: Citation[];
}
export interface ChatSummary {
  id: string;
  caseId: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  _count: { messages: number };
}
export interface ChatRecord extends ChatSummary {
  messages: Message[];
}
export interface ChatReply {
  chatId?: string;
  title?: string;
  userMessage: Message;
  assistantMessage: Message;
}
export interface Artifact {
  id: string;
  caseId: string;
  type: ArtifactType;
  version: number;
  caseRevision: number;
  status: 'DRAFT' | 'APPROVED';
  content: JsonObject;
  isStale?: boolean;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
  approvedAt: string | null;
}
export interface ReportSection {
  id: string;
  heading: string;
  paragraphs: string[];
  sourceCodes: string[];
  emptyText?: string;
}
export interface ChatInput {
  message: string;
  documentIds?: string[];
  targetSection?: string;
}
export interface CaseInput {
  title: string;
  internalReference?: string | null;
  publicReference?: string | null;
  caseFamily: CaseFamily;
  assignment: Pick<Assignment, 'client' | 'requestedScope' | 'limitations'>;
  openQuestions: string[];
  status?: Exclude<CaseStatus, 'APPROVED'>;
}
export interface AttachSourceInput {
  availability: Availability;
  documentId?: string;
  displayName?: string;
  documentType?: string;
  verificationPurpose?: string;
  excerptText?: string;
  documentDate?: string;
  senderOrAuthor?: string;
  metadata?: JsonObject;
}
export interface EvidenceInput {
  fieldKey: string;
  value: Json;
  unit?: string;
  comparisonGroup?: string;
  epistemicStatus: Exclude<EvidenceStatus, 'CALCULATED'>;
  attribution?: string;
  sources: SourceReference[];
}
export interface EventInput {
  event: string;
  date?: string;
  dateType: EventDateType;
  epistemicStatus: Exclude<EvidenceStatus, 'CALCULATED'>;
  attribution?: string;
  sources: SourceReference[];
}
export interface IssueInput {
  title: string;
  explanation: string;
  status: ChecklistStatus;
  severity?: string;
  suggestedCheck?: string;
  ruleId?: string;
  ruleVersion?: string;
  evidenceIds: string[];
}
export interface CalculationInput {
  fieldKey: string;
  columnHeader: string;
  worksheetName?: string;
  headerRow: number;
  operation: 'SUM' | 'MIN' | 'MAX' | 'MEAN' | 'COUNT' | 'RANGE';
  unit?: string;
  comparisonGroup?: string;
  decimalSeparator: '.' | ',';
  thousandsSeparator?: '.' | ',' | ' ' | '_';
}
