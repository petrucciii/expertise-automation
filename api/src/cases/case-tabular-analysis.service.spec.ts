import { BadRequestException } from '@nestjs/common';
import { EvidenceStatus } from '../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentExtractService } from '../documents/document-extract.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CasesService } from './cases.service.js';
import { CaseTabularAnalysisService } from './case-tabular-analysis.service.js';

describe('CaseTabularAnalysisService', () => {
  it('stores deterministic summary results as sourced calculated evidence', async () => {
    const summary = {
      worksheetName: 'Temperature',
      columnHeader: 'Temperature C',
      headerRow: 1,
      firstDataRow: 2,
      lastDataRow: 12,
      includedCount: 10,
      blankCellCount: 0,
      nonNumericCellCount: 1,
      formulaCellsExcluded: 1,
      operation: 'MEAN' as const,
      result: 4.75,
      formula: 'sum(valid numeric cells) / included count',
      sourceFileName: 'temperatures.csv',
      sourceSha256: 'a'.repeat(64),
    };
    const addEvidence = vi.fn().mockResolvedValue({ id: 'evidence-1' });
    const cases = {
      requireOwnedCase: vi.fn(),
      addEvidence,
    } as unknown as CasesService;
    const prisma = {
      caseDocument: {
        findFirst: vi.fn().mockResolvedValue({
          availability: 'ORIGINAL_ACCESSIBLE',
          document: {
            id: 'document-1',
            ownerId: 1,
            deleted_at: null,
          },
        }),
      },
    } as unknown as PrismaService;
    const documents = {
      calculateNumericColumn: vi.fn().mockResolvedValue(summary),
    } as unknown as DocumentExtractService;
    const service = new CaseTabularAnalysisService(prisma, cases, documents);

    const result = await service.calculateColumn('case-1', 'DOC-001', 1, {
      fieldKey: 'temperature.mean',
      columnHeader: 'Temperature C',
      operation: 'MEAN',
      unit: 'C',
    });

    expect(result.calculation.result).toBe(4.75);
    expect(addEvidence).toHaveBeenCalledWith(
      'case-1',
      1,
      expect.objectContaining({
        fieldKey: 'temperature.mean',
        value: 4.75,
        unit: 'C',
        epistemicStatus: EvidenceStatus.CALCULATED,
        sources: [{ sourceCode: 'DOC-001' }],
      }),
      expect.objectContaining({
        methodVersion: 'numeric-column-summary-1.1',
        formulaCellsExcluded: 1,
        sourceSha256: 'a'.repeat(64),
      }),
    );
  });

  it('rejects unavailable sources before reading their files', async () => {
    const calculateNumericColumn = vi.fn();
    const service = new CaseTabularAnalysisService(
      {
        caseDocument: {
          findFirst: vi.fn().mockResolvedValue({
            availability: 'REFERENCED_NOT_ACCESSIBLE',
            document: null,
          }),
        },
      } as unknown as PrismaService,
      { requireOwnedCase: vi.fn() } as unknown as CasesService,
      { calculateNumericColumn } as unknown as DocumentExtractService,
    );

    await expect(
      service.calculateColumn('case-1', 'DOC-001', 1, {
        fieldKey: 'temperature.mean',
        columnHeader: 'Temperature C',
        operation: 'MEAN',
        unit: 'C',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calculateNumericColumn).not.toHaveBeenCalled();
  });
});
