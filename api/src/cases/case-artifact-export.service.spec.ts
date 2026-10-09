import { describe, expect, it } from 'vitest';
import { CaseArtifactType } from '../generated/prisma/client.js';
import type { CaseArtifactsService } from './case-artifacts.service.js';
import type { CasesService } from './cases.service.js';
import { CaseArtifactExportService } from './case-artifact-export.service.js';

describe('CaseArtifactExportService', () => {
  it('exports the structured case as JSON', async () => {
    const service = createService(CaseArtifactType.STRUCTURED_CASE, {
      schemaVersion: '1.0',
      case: { publicReference: 'SURVEY-1' },
    });

    const result = await service.exportLatest(
      'case-1',
      7,
      CaseArtifactType.STRUCTURED_CASE,
    );

    expect(result.fileName).toBe('SURVEY-1_case.json');
    expect(result.contentType).toContain('application/json');
    expect(JSON.parse(result.buffer.toString('utf8'))).toMatchObject({
      case: { publicReference: 'SURVEY-1' },
    });
  });

  it('exports the document register as an XLSX archive', async () => {
    const service = createService(CaseArtifactType.DOCUMENT_REGISTER, {
      documents: [
        {
          sourceCode: 'DOC-001',
          document: 'bill.pdf',
          availability: 'ORIGINAL_ACCESSIBLE',
        },
      ],
    });

    const result = await service.exportLatest(
      'case-1',
      7,
      CaseArtifactType.DOCUMENT_REGISTER,
    );

    expect(result.fileName).toBe('SURVEY-1_document_register.xlsx');
    expect(result.contentType).toContain('spreadsheetml.sheet');
    expect(result.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });

  it('exports review and report drafts as Word documents', async () => {
    const report = createService(CaseArtifactType.SURVEY_REPORT_DRAFT, {
      sections: [
        {
          heading: 'Eventi documentati',
          paragraphs: ['Il documento DOC-001 riporta un evento.'],
          sourceCodes: ['DOC-001'],
        },
      ],
    });
    const result = await report.exportLatest(
      'case-1',
      7,
      CaseArtifactType.SURVEY_REPORT_DRAFT,
    );

    expect(result.fileName).toBe('SURVEY-1_survey_report_draft.docx');
    expect(result.contentType).toContain('wordprocessingml.document');
    expect(result.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});

function createService(type: CaseArtifactType, content: unknown) {
  const artifacts = {
    getLatest: async () => ({ id: 'artifact-1', type, content }),
  } as unknown as CaseArtifactsService;
  const cases = {
    get: async () => ({
      id: 'case-1',
      internalReference: null,
      title: 'Test case',
      publicReference: 'SURVEY-1',
    }),
  } as unknown as CasesService;
  return new CaseArtifactExportService(artifacts, cases);
}
