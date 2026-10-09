import { validateOfficeArchive } from './office-archive.js';
import { bumpCaseRevision } from '../cases/case-revision.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type ExtractionStatus } from '../generated/prisma/client.js';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { Worker } from 'node:worker_threads';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseEmail } from './eml-parser.js';
import {
  summarizeNumericColumn,
  type NumericColumnOptions,
} from './tabular-analysis.js';

const MAX_PDF_PAGES = 200;
const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const MAX_SPREADSHEET_ROWS = 20_000;
const MAX_SPREADSHEET_COLUMNS = 1_000;
const MAX_SPREADSHEET_CELLS = 200_000;
const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv';

type ExtractedPage = { pageNumber: number; text: string };
type ExtractionResult = {
  content: string;
  pages?: ExtractedPage[];
  requiresReview?: boolean;
};
type ExtractedDocumentText = {
  documentId: string;
  content: string;
  pages: Prisma.JsonValue | ExtractedPage[] | null;
  extractionStatus: ExtractionStatus;
  extractionTruncated: boolean;
  extractionReviewedAt: Date | null;
  sourceMetadata: Prisma.JsonValue | null;
};

@Injectable()
export class DocumentExtractService {
  constructor(private readonly prisma: PrismaService) {}

  async getText(id: string, ownerId: number): Promise<ExtractedDocumentText> {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId, deleted_at: null },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.extractedText !== null) {
      return {
        documentId: document.id,
        content: document.extractedText,
        pages: document.extractedPages,
        extractionStatus: document.extractionStatus,
        extractionTruncated: document.extractionTruncated,
        extractionReviewedAt: document.extractionReviewedAt,
        sourceMetadata: document.sourceMetadata,
      };
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(document.path);
    } catch {
      throw new NotFoundException('Document file is not available');
    }
    if (!buffer.length) {
      throw new BadRequestException('Document file is empty');
    }
    assertDocumentIntegrity(buffer, document.hash);

    const extracted = await this.extract(document.mimeType, buffer);
    const content = extracted.content.slice(0, MAX_EXTRACTED_CHARACTERS);
    const clippedPages = extracted.pages
      ? clipPages(extracted.pages, MAX_EXTRACTED_CHARACTERS)
      : null;
    const truncated =
      extracted.content.length > MAX_EXTRACTED_CHARACTERS ||
      (clippedPages?.truncated ?? false);
    const extractionStatus =
      truncated || extracted.requiresReview || content.trim().length < 10
        ? 'NEEDS_REVIEW'
        : 'EXTRACTED';

    const saved = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.document.updateMany({
        where: { id, ownerId, deleted_at: null, extractedText: null },
        data: {
          extractedText: content,
          extractedPages: clippedPages
            ? (clippedPages.pages as unknown as Prisma.InputJsonArray)
            : Prisma.DbNull,
          extractionStatus,
          extractionTruncated: truncated,
        },
      });
      if (updated.count) await invalidateLinkedCases(transaction, id);
      return updated;
    });
    if (!saved.count) {
      // A parallel extraction may have populated the cache while this one ran.
      return this.getText(id, ownerId);
    }

    return {
      documentId: document.id,
      content,
      pages: clippedPages?.pages ?? null,
      extractionStatus,
      extractionTruncated: truncated,
      extractionReviewedAt: null,
      sourceMetadata: document.sourceMetadata,
    };
  }

  async confirmExtractionReview(id: string, ownerId: number) {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId, deleted_at: null },
      select: {
        id: true,
        fileName: true,
        extractedText: true,
        extractionTruncated: true,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (!document.extractedText?.trim()) {
      throw new BadRequestException(
        'Extract document text before confirming its review',
      );
    }
    if (document.extractionTruncated) {
      throw new BadRequestException(
        'Truncated extraction cannot be confirmed as complete; register a smaller excerpt instead',
      );
    }

    const reviewedAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.document.updateMany({
        where: {
          id,
          ownerId,
          deleted_at: null,
          extractedText: document.extractedText,
          extractionTruncated: false,
        },
        data: {
          extractionStatus: 'EXTRACTED',
          extractionReviewedById: ownerId,
          extractionReviewedAt: reviewedAt,
        },
      });
      if (result.count) await invalidateLinkedCases(transaction, id);
      return result;
    });
    if (!updated.count) {
      throw new NotFoundException('Document not found');
    }
    return {
      documentId: document.id,
      fileName: document.fileName,
      extractionStatus: 'EXTRACTED',
      extractionReviewedAt: reviewedAt,
    };
  }

  async getImageForAnalysis(
    id: string,
    ownerId: number,
  ): Promise<{
    mimeType: 'image/png' | 'image/jpeg';
    data: Buffer;
  } | null> {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId, deleted_at: null },
      select: { path: true, mimeType: true, hash: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (
      document.mimeType !== 'image/png' &&
      document.mimeType !== 'image/jpeg'
    ) {
      return null;
    }

    let data: Buffer;
    try {
      data = await fs.readFile(document.path);
    } catch {
      throw new NotFoundException('Document file is not available');
    }
    assertDocumentIntegrity(data, document.hash);
    if (!data.length || data.length > MAX_IMAGE_INPUT_BYTES) {
      throw new BadRequestException(
        'Image cannot be sent for AI review because it exceeds supported limits',
      );
    }
    return { mimeType: document.mimeType, data };
  }

  async calculateNumericColumn(
    id: string,
    ownerId: number,
    options: NumericColumnOptions,
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId, deleted_at: null },
      select: { fileName: true, mimeType: true, path: true, hash: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.mimeType !== XLSX_MIME && document.mimeType !== CSV_MIME) {
      throw new BadRequestException(
        'Numeric calculations support only CSV and XLSX documents',
      );
    }

    let file: Buffer;
    try {
      file = await fs.readFile(document.path);
    } catch {
      throw new NotFoundException('Document file is not available');
    }
    validateFile(file);
    assertDocumentIntegrity(file, document.hash);
    const workbook = await readSpreadsheetWorkbook(file, document.mimeType);
    workbookToText(workbook);

    return {
      ...summarizeNumericColumn(workbook, options),
      sourceFileName: document.fileName,
      sourceSha256: document.hash,
    };
  }

  private async extract(
    mimeType: string,
    file: Buffer,
  ): Promise<ExtractionResult> {
    switch (mimeType) {
      case 'application/pdf':
        return this.extractPdf(file);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.extractDocx(file);
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return this.extractXlsx(file);
      case 'text/csv':
        return this.extractCsv(file);
      case 'image/png':
      case 'image/jpeg':
      case 'image/tiff':
        return {
          content: await this.extractImageWithOcr(file),
          requiresReview: true,
        };
      case 'message/rfc822':
        return { content: parseEmail(file).text };
      default:
        throw new BadRequestException('Document format is not supported');
    }
  }

  private async extractPdf(file: Buffer): Promise<ExtractionResult> {
    validateFile(file);
    const parser = new PDFParse({ data: Uint8Array.from(file) });
    try {
      let info;
      try {
        info = await parser.getInfo({ parsePageInfo: true });
      } catch {
        throw new BadRequestException('PDF is not valid or cannot be read');
      }
      if (info.total === 0 || info.total > MAX_PDF_PAGES) {
        throw new BadRequestException(
          `PDF must contain between 1 and ${MAX_PDF_PAGES} pages`,
        );
      }
      // Reject oversized canvases before rasterization, including sparse scanned pages.
      if (
        info.pages.some(
          (page) =>
            !Number.isFinite(page.width) ||
            !Number.isFinite(page.height) ||
            page.width <= 0 ||
            page.height <= 0 ||
            page.width * page.height * 4 > 40_000_000,
        )
      ) {
        throw new BadRequestException(
          'PDF page dimensions exceed the supported rendering limit',
        );
      }

      let result;
      try {
        result = await parser.getText();
      } catch {
        throw new BadRequestException('PDF is not valid or cannot be read');
      }

      if (result.pages.some((page) => page.text.trim().length < 10)) {
        // Await inside try so finally cannot destroy the parser while OCR is running.
        return await this.extractPdfWithOcr(parser, info.total);
      }
      const pages = result.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text,
      }));
      return { content: result.text, pages };
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocx(file: Buffer): Promise<{ content: string }> {
    validateFile(file);
    validateOfficeArchive(file, ['word/document.xml']);
    const worker = new Worker(
      new URL('./office-text.worker.mjs', import.meta.url),
      {
        workerData: file,
        resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 2 },
      },
    );
    try {
      return await new Promise<ExtractionResult>((resolve, reject) => {
        const fail = () =>
          reject(
            new BadRequestException(
              'DOCX is invalid or exceeds supported parsing limits',
            ),
          );
        const timeout = setTimeout(fail, 15_000);
        timeout.unref();
        worker.once('message', (value: unknown) => {
          clearTimeout(timeout);
          if (isRecord(value) && typeof value.content === 'string')
            resolve({ content: value.content });
          else fail();
        });
        worker.once('error', () => {
          clearTimeout(timeout);
          fail();
        });
        worker.once('exit', () => {
          clearTimeout(timeout);
          fail();
        });
      });
    } catch {
      throw new BadRequestException(
        'DOCX is invalid or exceeds supported parsing limits',
      );
    } finally {
      await worker.terminate();
    }
  }

  private async extractXlsx(file: Buffer): Promise<{ content: string }> {
    const workbook = await readSpreadsheetWorkbook(file, XLSX_MIME);
    return { content: workbookToText(workbook) };
  }

  private async extractCsv(file: Buffer): Promise<{ content: string }> {
    const workbook = await readSpreadsheetWorkbook(file, CSV_MIME);
    return { content: workbookToText(workbook) };
  }

  private async extractPdfWithOcr(
    parser: PDFParse,
    pageCount: number,
  ): Promise<ExtractionResult> {
    const worker = await this.createOcrWorker();
    try {
      const pages: ExtractedPage[] = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const rendered = await parser.getScreenshot({
          partial: [pageNumber],
          scale: 2,
          imageBuffer: true,
          imageDataUrl: false,
        });
        const image = rendered.pages[0]?.data;
        if (!image) {
          throw new BadRequestException(
            'PDF page could not be rendered for OCR',
          );
        }
        const result = await worker.recognize(
          Buffer.isBuffer(image) ? image : Buffer.from(image),
        );
        const text = result.data.text.trim();
        // Empty pages remain in the page ledger; they are never silently omitted.
        pages.push({ pageNumber, text });
      }
      return {
        content: pages
          .map((page) => `[Page ${page.pageNumber}]\n${page.text}`)
          .join('\n\n'),
        pages,
        requiresReview: true,
      };
    } finally {
      await worker.terminate();
    }
  }

  private async extractImageWithOcr(file: Buffer): Promise<string> {
    validateFile(file);
    const worker = await this.createOcrWorker();
    try {
      const normalized = await sharp(file, { limitInputPixels: 40_000_000 })
        .png()
        .toBuffer();
      const result = await worker.recognize(normalized);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  }

  private async createOcrWorker() {
    const cachePath = path.resolve(
      process.env.OCR_CACHE_DIR?.trim() ||
        path.join(process.cwd(), '.cache', 'ocr'),
    );
    await fs.mkdir(cachePath, { recursive: true, mode: 0o700 });
    return createWorker(['ita', 'eng'], 1, { cachePath });
  }
}

async function invalidateLinkedCases(
  transaction: Prisma.TransactionClient,
  documentId: string,
): Promise<void> {
  const links = await transaction.caseDocument.findMany({
    where: { documentId },
    select: { caseId: true },
    orderBy: { caseId: 'asc' },
  });
  for (const caseId of new Set(links.map((link) => link.caseId)))
    await bumpCaseRevision(transaction, caseId);
}

async function readSpreadsheetWorkbook(
  file: Buffer,
  mimeType: string,
): Promise<ExcelJS.Workbook> {
  validateFile(file);
  const workbook = new ExcelJS.Workbook();
  if (mimeType === XLSX_MIME) {
    validateOfficeArchive(file, ['xl/workbook.xml']);
    try {
      await workbook.xlsx.read(Readable.from([file]));
    } catch {
      throw new BadRequestException('XLSX is not valid or cannot be read');
    }
    return workbook;
  }
  if (mimeType === CSV_MIME) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true })
        .decode(file)
        .replace(/^\uFEFF/, '');
    } catch {
      throw new BadRequestException('CSV must be valid UTF-8 text');
    }
    if (text.includes('\u0000')) {
      throw new BadRequestException('CSV contains unsupported binary data');
    }
    try {
      await workbook.csv.read(Readable.from([Buffer.from(text, 'utf8')]), {
        sheetName: 'CSV',
        map: (value) => value,
        parserOptions: { delimiter: detectCsvDelimiter(text) },
      });
    } catch {
      throw new BadRequestException('CSV is not valid or cannot be read');
    }
    return workbook;
  }
  throw new BadRequestException('Spreadsheet format is not supported');
}

function validateFile(file: Buffer): void {
  if (!Buffer.isBuffer(file) || file.length === 0) {
    throw new BadRequestException('Document file is invalid');
  }
}

function assertDocumentIntegrity(file: Buffer, expectedHash: string): void {
  const actualHash = createHash('sha256').update(file).digest('hex');
  if (actualHash !== expectedHash) {
    throw new ConflictException('Stored document integrity check failed');
  }
}

function clipPages(
  pages: ExtractedPage[],
  maxCharacters: number,
): { pages: ExtractedPage[]; truncated: boolean } {
  let remaining = maxCharacters;
  let truncated = false;
  const clipped: ExtractedPage[] = [];
  for (const page of pages) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const text = page.text.slice(0, remaining);
    clipped.push({ pageNumber: page.pageNumber, text });
    remaining -= text.length;
    truncated ||= text.length < page.text.length;
  }
  return { pages: clipped, truncated };
}

function workbookToText(workbook: ExcelJS.Workbook): string {
  let rowCount = 0;
  let cellCount = 0;
  return workbook.worksheets
    .map((worksheet) => {
      const lines = [`Sheet: ${worksheet.name}`];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        rowCount += 1;
        if (
          rowCount > MAX_SPREADSHEET_ROWS ||
          rowNumber > MAX_SPREADSHEET_ROWS
        ) {
          throw new BadRequestException(
            'Spreadsheet exceeds the supported row limit',
          );
        }
        const values: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
          cellCount += 1;
          if (
            columnNumber > MAX_SPREADSHEET_COLUMNS ||
            cellCount > MAX_SPREADSHEET_CELLS
          ) {
            throw new BadRequestException(
              'Spreadsheet exceeds the supported cell limit',
            );
          }
          values[columnNumber - 1] = spreadsheetCellText(cell.value);
        });
        lines.push(values.join('\t'));
      });
      return lines.join('\n');
    })
    .join('\n\n');
}

function spreadsheetCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const record = value as unknown as Record<string, unknown>;
    if (Array.isArray(record.richText)) {
      return record.richText
        .flatMap((part) =>
          isRecord(part) && typeof part.text === 'string' ? [part.text] : [],
        )
        .join('');
    }
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (typeof record.formula === 'string') {
      const cached =
        record.result === undefined
          ? ''
          : ` [cached: ${spreadsheetCellText(record.result as ExcelJS.CellValue)}]`;
      return `=${record.formula}${cached}`;
    }
    if (typeof record.error === 'string') {
      return record.error;
    }
    return JSON.stringify(value) ?? '';
  }
  return String(value);
}

function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = new Map<string, number>([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  let inQuotes = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    if (character === '"') {
      if (inQuotes && firstLine[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && counts.has(character)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    ','
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
