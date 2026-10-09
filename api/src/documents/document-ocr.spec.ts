import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DocumentExtractService } from './document-extract.service.js';

const { parser, worker } = vi.hoisted(() => ({
  parser: {
    getInfo: vi.fn(),
    getText: vi.fn(),
    getScreenshot: vi.fn(),
    destroy: vi.fn(),
  },
  worker: { recognize: vi.fn(), terminate: vi.fn() },
}));
vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(function () {
    return parser;
  }),
}));
vi.mock('tesseract.js', () => ({ createWorker: vi.fn(async () => worker) }));

describe('PDF and image OCR lifecycle and review status', () => {
  let directory: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expertise-ocr-unit-'));
    parser.getInfo.mockResolvedValue({
      total: 2,
      pages: [
        { width: 595, height: 842 },
        { width: 595, height: 842 },
      ],
    });
    parser.getText.mockResolvedValue({
      text: 'Documented cargo statement',
      pages: [
        { num: 1, text: 'Documented cargo statement' },
        { num: 2, text: '' },
      ],
    });
    parser.getScreenshot.mockResolvedValue({
      pages: [{ data: Buffer.from('rendered-page') }],
    });
    parser.destroy.mockResolvedValue(undefined);
    worker.recognize.mockResolvedValue({
      data: { text: 'OCR cargo statement' },
    });
    worker.terminate.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    if (
      path.dirname(directory) === path.resolve(os.tmpdir()) &&
      path.basename(directory).startsWith('expertise-ocr-unit-')
    )
      await fs.rm(directory, { recursive: true, force: true });
  });

  async function extract(
    mimeType = 'application/pdf',
    bytes = Buffer.from('%PDF-synthetic'),
  ) {
    const filePath = path.join(directory, 'original');
    await fs.writeFile(filePath, bytes);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      document: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'test-document',
          path: filePath,
          hash: createHash('sha256').update(bytes).digest('hex'),
          mimeType,
          extractedText: null,
          sourceMetadata: null,
        }),
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          document: { updateMany },
          caseDocument: { findMany: vi.fn().mockResolvedValue([]) },
        }),
      ),
    } as unknown as PrismaService;
    return new DocumentExtractService(prisma).getText('test-document', 1);
  }

  it('OCRs all pages of a mixed PDF and always requires human review', async () => {
    const result = await extract();
    expect(result.extractionStatus).toBe('NEEDS_REVIEW');
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'OCR cargo statement' },
      { pageNumber: 2, text: 'OCR cargo statement' },
    ]);
    expect(parser.getScreenshot).toHaveBeenCalledTimes(2);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(parser.destroy).toHaveBeenCalledOnce();
    expect(parser.destroy.mock.invocationCallOrder[0]).toBeGreaterThan(
      worker.terminate.mock.invocationCallOrder[0],
    );
  });

  it('retains the page ledger even when OCR finds no text on a page', async () => {
    worker.recognize.mockResolvedValue({ data: { text: '' } });
    expect((await extract()).pages).toEqual([
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: '' },
    ]);
  });

  it('uses PDF text directly when every page has a readable text layer', async () => {
    parser.getText.mockResolvedValue({
      text: 'Two readable pages',
      pages: [
        { num: 1, text: 'First cargo page text' },
        { num: 2, text: 'Second cargo page text' },
      ],
    });
    expect((await extract()).extractionStatus).toBe('EXTRACTED');
    expect(worker.recognize).not.toHaveBeenCalled();
    expect(parser.destroy).toHaveBeenCalledOnce();
  });

  it.each([0, 201])('rejects a PDF with %s pages before OCR', async (total) => {
    parser.getInfo.mockResolvedValue({ total, pages: [] });
    await expect(extract()).rejects.toMatchObject({ status: 400 });
    expect(worker.recognize).not.toHaveBeenCalled();
    expect(parser.destroy).toHaveBeenCalledOnce();
  });

  it('refuses oversized PDF canvases before allocating a screenshot', async () => {
    parser.getInfo.mockResolvedValue({
      total: 1,
      pages: [{ width: 100_000, height: 100_000 }],
    });
    await expect(extract()).rejects.toMatchObject({ status: 400 });
    expect(parser.getScreenshot).not.toHaveBeenCalled();
    expect(parser.destroy).toHaveBeenCalledOnce();
  });

  it('terminates the worker and parser after recognition errors', async () => {
    worker.recognize.mockRejectedValue(new Error('OCR failed'));
    await expect(extract()).rejects.toThrow('OCR failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(parser.destroy).toHaveBeenCalledOnce();
  });

  it('rejects a missing rendered page without silently producing a partial extraction', async () => {
    parser.getScreenshot.mockResolvedValue({ pages: [] });
    await expect(extract()).rejects.toMatchObject({ status: 400 });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(parser.destroy).toHaveBeenCalledOnce();
  });

  it.each(['png', 'jpeg', 'tiff'] as const)(
    'normalizes %s originals for OCR and requires human review',
    async (format) => {
      const bytes = await sharp({
        create: { width: 16, height: 16, channels: 3, background: '#ffffff' },
      })
        .toFormat(format)
        .toBuffer();
      expect((await extract(`image/${format}`, bytes)).extractionStatus).toBe(
        'NEEDS_REVIEW',
      );
      const input = worker.recognize.mock.calls[0][0] as Buffer;
      expect(input.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );
});
