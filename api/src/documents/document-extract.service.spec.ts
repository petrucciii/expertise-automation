import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DocumentExtractService } from './document-extract.service.js';

describe('DocumentExtractService spreadsheet extraction', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expertise-extract-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('preserves CSV values and supports semicolon delimiters', async () => {
    const result = await extractDocument(
      directory,
      'text/csv',
      Buffer.from('container;pallets\n001;24\n002;29\n', 'utf8'),
    );

    expect(result.content).toContain('container\tpallets');
    expect(result.content).toContain('001\t24');
    expect(result.content).toContain('002\t29');
  });

  it('reads XLSX worksheets and keeps formulas as unevaluated text', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Container tally');
    worksheet.addRow(['container', 'pallets']);
    worksheet.addRow(['A', 29]);
    worksheet.addRow(['B', { formula: 'SUM(B2:B3)', result: 63 }]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await extractDocument(
      directory,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    );

    expect(result.content).toContain('Sheet: Container tally');
    expect(result.content).toContain('A\t29');
    expect(result.content).toContain('=SUM(B2:B3) [cached: 63]');
  });

  it('records an explicit human confirmation for extracted document text', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      document: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document-1',
          fileName: 'survey.csv',
          extractedText: 'Recorded source text',
        }),
        updateMany,
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          document: { updateMany },
          caseDocument: { findMany: vi.fn().mockResolvedValue([]) },
        }),
      ),
    } as unknown as PrismaService;
    const service = new DocumentExtractService(prisma);

    const result = await service.confirmExtractionReview('document-1', 9);

    expect(result.extractionStatus).toBe('EXTRACTED');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'document-1', ownerId: 9 }),
        data: expect.objectContaining({
          extractionStatus: 'EXTRACTED',
          extractionReviewedById: 9,
        }),
      }),
    );
  });
});

async function extractDocument(
  directory: string,
  mimeType: string,
  buffer: Buffer,
) {
  const filePath = path.join(directory, 'source');
  await fs.writeFile(filePath, buffer);
  const prisma = {
    document: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'document-1',
        ownerId: 9,
        fileName: 'source',
        mimeType,
        path: filePath,
        hash: createHash('sha256').update(buffer).digest('hex'),
        extractedText: null,
        extractedPages: null,
        extractionStatus: 'PENDING',
        extractionReviewedAt: null,
        sourceMetadata: null,
        deleted_at: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({
        document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        caseDocument: { findMany: vi.fn().mockResolvedValue([]) },
      }),
    ),
  } as unknown as PrismaService;

  return new DocumentExtractService(prisma).getText('document-1', 9);
}
