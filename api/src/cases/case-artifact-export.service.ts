import { ConflictException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  AlignmentType,
  Document as WordDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { CaseArtifactType } from '../generated/prisma/client.js';
import { CaseArtifactsService } from './case-artifacts.service.js';
import { CasesService } from './cases.service.js';
import { describeEventDate } from './report-event-date.js';

export type ArtifactDownload = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class CaseArtifactExportService {
  constructor(
    private readonly artifacts: CaseArtifactsService,
    private readonly cases: CasesService,
  ) {}

  async exportLatest(
    caseId: string,
    ownerId: number,
    type: CaseArtifactType,
  ): Promise<ArtifactDownload> {
    const [artifact, record] = await Promise.all([
      this.artifacts.getLatest(caseId, ownerId, type),
      this.cases.get(caseId, ownerId),
    ]);
    if (artifact.caseRevision !== record.revision) {
      throw new ConflictException(
        'Artifact is out of date. Generate a new version before exporting it.',
      );
    }
    const baseName = safeFileName(
      record.publicReference ?? record.internalReference ?? record.title,
    );
    if (
      [
        CaseArtifactType.PRELIMINARY_REVIEW,
        CaseArtifactType.SURVEY_REPORT_DRAFT,
      ].includes(type as 'PRELIMINARY_REVIEW' | 'SURVEY_REPORT_DRAFT') &&
      artifact.status !== 'APPROVED'
    ) {
      throw new ConflictException(
        'Approve the narrative artifact before exporting it',
      );
    }

    if (type === CaseArtifactType.STRUCTURED_CASE) {
      return {
        buffer: Buffer.from(JSON.stringify(artifact.content, null, 2), 'utf8'),
        fileName: `${baseName}_case.json`,
        contentType: 'application/json; charset=utf-8',
      };
    }
    if (type === CaseArtifactType.DOCUMENT_REGISTER) {
      return {
        buffer: await createRegisterWorkbook(
          artifact.content,
          artifact.status,
          artifact.version,
          artifact.caseRevision,
        ),
        fileName: `${baseName}_document_register.xlsx`,
        contentType: XLSX_CONTENT_TYPE,
      };
    }
    return {
      buffer: await createWordDocument(type, artifact.content, artifact.status),
      fileName:
        type === CaseArtifactType.PRELIMINARY_REVIEW
          ? `${baseName}_preliminary_review.docx`
          : `${baseName}_survey_report_draft.docx`,
      contentType: DOCX_CONTENT_TYPE,
    };
  }
}

async function createRegisterWorkbook(
  content: unknown,
  status: string,
  version: number,
  caseRevision: number,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Expertise Automation';
  workbook.subject = 'Case document register';
  workbook.created = new Date();

  const metadata = workbook.addWorksheet('Artifact');
  metadata.addRows([
    ['Artifact status', status],
    ['Artifact version', version],
    ['Case revision', caseRevision],
  ]);

  const sheet = workbook.addWorksheet('Document register');
  sheet.columns = [
    { header: 'Source ID', key: 'sourceCode', width: 16 },
    { header: 'Document', key: 'document', width: 36 },
    { header: 'Type', key: 'documentType', width: 22 },
    { header: 'Availability', key: 'availability', width: 30 },
    { header: 'Extraction status', key: 'extractionStatus', width: 22 },
    { header: 'Extraction truncated', key: 'extractionTruncated', width: 22 },
    {
      header: 'Extraction reviewed at',
      key: 'extractionReviewedAt',
      width: 26,
    },
    { header: 'SHA-256', key: 'sha256', width: 66 },
    { header: 'Registered excerpt', key: 'excerptText', width: 48 },
    {
      header: 'What this source can verify',
      key: 'verificationPurpose',
      width: 48,
    },
    { header: 'Document date', key: 'documentDate', width: 22 },
    { header: 'Sender or author', key: 'senderOrAuthor', width: 32 },
    { header: 'Email metadata', key: 'emailMetadata', width: 64 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const register =
    isRecord(content) && Array.isArray(content.documents)
      ? content.documents
      : [];
  for (const entry of register) {
    if (!isRecord(entry)) {
      continue;
    }
    sheet.addRow({
      sourceCode: toSpreadsheetCellText(entry.sourceCode),
      document: toSpreadsheetCellText(entry.document),
      documentType: toSpreadsheetCellText(entry.documentType),
      availability: toSpreadsheetCellText(entry.availability),
      extractionStatus: toSpreadsheetCellText(entry.extractionStatus),
      extractionTruncated: toSpreadsheetCellText(entry.extractionTruncated),
      extractionReviewedAt: toSpreadsheetCellText(entry.extractionReviewedAt),
      sha256: toSpreadsheetCellText(entry.sha256),
      excerptText: toSpreadsheetCellText(entry.excerptText),
      verificationPurpose: toSpreadsheetCellText(entry.verificationPurpose),
      documentDate: toSpreadsheetCellText(entry.documentDate),
      senderOrAuthor: toSpreadsheetCellText(entry.senderOrAuthor),
      emailMetadata: toSpreadsheetCellText(entry.emailMetadata),
    });
  }
  sheet.autoFilter = { from: 'A1', to: `M${Math.max(1, sheet.rowCount)}` };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function createWordDocument(
  type: CaseArtifactType,
  content: unknown,
  artifactStatus: string,
): Promise<Buffer> {
  const title =
    type === CaseArtifactType.PRELIMINARY_REVIEW
      ? 'Nota preliminare di verifica'
      : 'Bozza di relazione';
  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            artifactStatus === 'APPROVED'
              ? 'SURVEYOR APPROVED'
              : 'DRAFT — REQUIRES SURVEYOR REVIEW',
          bold: true,
          color: 'A33A2B',
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  ];

  if (type === CaseArtifactType.SURVEY_REPORT_DRAFT) {
    appendReportSections(children, content);
  } else {
    appendPreliminaryReview(children, content);
  }

  const document = new WordDocument({
    creator: 'Expertise Automation',
    title,
    description: 'Generated draft for surveyor review',
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}

function appendReportSections(children: Paragraph[], content: unknown): void {
  if (!isRecord(content) || !Array.isArray(content.sections)) {
    children.push(new Paragraph('No report sections are available.'));
    return;
  }
  for (const section of content.sections) {
    if (!isRecord(section)) {
      continue;
    }
    children.push(
      new Paragraph({
        text: toText(section.heading) || toText(section.id),
        heading: HeadingLevel.HEADING_1,
      }),
    );
    const paragraphs = Array.isArray(section.paragraphs)
      ? section.paragraphs
      : typeof section.paragraph === 'string'
        ? [section.paragraph]
        : [];
    const body = paragraphs.length
      ? paragraphs.map(toText)
      : [toText(section.emptyText)];
    for (const text of body.filter(Boolean)) {
      children.push(new Paragraph(text));
    }
    const sources = Array.isArray(section.sourceCodes)
      ? section.sourceCodes.map(toText).filter(Boolean)
      : [];
    if (sources.length) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Sources: ${[...new Set(sources)].join(', ')}`,
              italics: true,
            }),
          ],
        }),
      );
    }
  }
  if (Array.isArray(content.aiSuggestions) && content.aiSuggestions.length) {
    children.push(
      new Paragraph({
        text: 'AI-generated alternatives — unapproved',
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const suggestion of content.aiSuggestions) {
      if (!isRecord(suggestion)) {
        continue;
      }
      children.push(new Paragraph(toText(suggestion.paragraph)));
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Sources: ${arrayOfStrings(suggestion.sourceCodes).join(', ')}`,
              italics: true,
            }),
          ],
        }),
      );
    }
  }
}

function appendPreliminaryReview(
  children: Paragraph[],
  content: unknown,
): void {
  if (!isRecord(content)) {
    children.push(new Paragraph('No review content is available.'));
    return;
  }
  children.push(
    new Paragraph({ text: 'Chronology', heading: HeadingLevel.HEADING_1 }),
  );
  const chronology = Array.isArray(content.chronology)
    ? content.chronology
    : [];
  if (!chronology.length) {
    children.push(new Paragraph('No sourced events have been recorded.'));
  }
  for (const event of chronology) {
    if (!isRecord(event)) {
      continue;
    }
    const date = toText(event.date);
    const dateLabel = describeEventDate(date || null, toText(event.dateType));
    const sources = Array.isArray(event.sources)
      ? event.sources
          .map((source) => (isRecord(source) ? toText(source.sourceCode) : ''))
          .filter(Boolean)
      : [];
    children.push(
      new Paragraph({
        text: `${dateLabel ? `${dateLabel} — ` : ''}${toText(event.event)} [${toText(event.epistemicStatus)}]${event.attribution ? ` — ${toText(event.attribution)}` : ''}${sources.length ? ` (${sources.join(', ')})` : ''}`,
        bullet: { level: 0 },
      }),
    );
  }

  appendReviewGroup(children, 'Computed checks', content.computedChecks);
  appendReviewGroup(children, 'Surveyor checklist', content.surveyorChecklist);
  appendReviewGroup(children, 'Open questions', content.openQuestions);
  appendReviewGroup(children, 'Limitations', content.limitations);

  if (Array.isArray(content.aiSuggestions) && content.aiSuggestions.length) {
    children.push(
      new Paragraph({
        text: 'AI suggestions — unapproved',
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const finding of content.aiSuggestions) {
      if (!isRecord(finding)) {
        continue;
      }
      children.push(
        new Paragraph({
          text: toText(finding.title),
          heading: HeadingLevel.HEADING_2,
        }),
      );
      children.push(new Paragraph(toText(finding.concern)));
      children.push(
        new Paragraph(
          `Alternative explanation: ${toText(finding.alternativeExplanation)}`,
        ),
      );
      children.push(
        new Paragraph(`Suggested check: ${toText(finding.suggestedCheck)}`),
      );
      children.push(
        new Paragraph(
          `Sources: ${arrayOfStrings(finding.sourceCodes).join(', ')}`,
        ),
      );
    }
  }
}

function appendReviewGroup(
  children: Paragraph[],
  heading: string,
  value: unknown,
): void {
  children.push(
    new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }),
  );
  if (Array.isArray(value)) {
    if (!value.length) {
      children.push(new Paragraph('None recorded.'));
      return;
    }
    for (const entry of value) {
      children.push(
        new Paragraph({ text: formatObject(entry), bullet: { level: 0 } }),
      );
    }
    return;
  }
  children.push(new Paragraph(formatObject(value)));
}

function formatObject(value: unknown): string {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value, null, 2) ?? 'Not available');
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value) ?? '';
}

/** Protect spreadsheet viewers while preserving the original wording in Word paragraphs. */
function toSpreadsheetCellText(value: unknown): string {
  const text = toText(value);
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(toText).filter(Boolean) : [];
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80);
  return normalized || 'case';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
