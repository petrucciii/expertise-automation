import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import * as fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
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
type ExtractionResult = { content: string; pages?: ExtractedPage[] };

@Injectable()
export class DocumentExtractService {
  constructor(private readonly prisma: PrismaService) {}

  async getText(id: string, ownerId: number) {
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
      truncated || content.trim().length < 10 ? 'NEEDS_REVIEW' : 'EXTRACTED';

    const saved = await this.prisma.document.updateMany({
      where: { id, ownerId, deleted_at: null },
      data: {
        extractedText: content,
        extractedPages: clippedPages
          ? (clippedPages.pages as unknown as Prisma.InputJsonArray)
          : Prisma.DbNull,
        extractionStatus,
        extractionTruncated: truncated,
      },
    });
    if (!saved.count) {
      throw new NotFoundException('Document not found');
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
    const updated = await this.prisma.document.updateMany({
      where: { id, ownerId, deleted_at: null, extractedText: { not: null } },
      data: {
        extractionStatus: 'EXTRACTED',
        extractionReviewedById: ownerId,
        extractionReviewedAt: reviewedAt,
      },
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
        return { content: await this.extractImageWithOcr(file) };
      case 'message/rfc822':
        return { content: parseEmail(file.toString('utf8')).text };
      default:
        throw new BadRequestException('Document format is not supported');
    }
  }

  private async extractPdf(file: Buffer): Promise<ExtractionResult> {
    validateFile(file);
    const parser = new PDFParse({ data: Uint8Array.from(file) });
    try {
      const info = await parser.getInfo({ parsePageInfo: true });
      if (info.total === 0 || info.total > MAX_PDF_PAGES) {
        throw new BadRequestException(
          `PDF must contain between 1 and ${MAX_PDF_PAGES} pages`,
        );
      }

      let result;
      try {
        result = await parser.getText();
      } catch {
        throw new BadRequestException('PDF is not valid or cannot be read');
      }

      if (result.text.trim().length < 50) {
        return this.extractPdfWithOcr(parser, info.total);
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
    try {
      const result = await mammoth.extractRawText({ buffer: file });
      return { content: result.value };
    } catch {
      throw new BadRequestException('DOCX is not valid or cannot be read');
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
    const worker = await createWorker(['ita', 'eng']);
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
          continue;
        }
        const result = await worker.recognize(
          Buffer.isBuffer(image) ? image : Buffer.from(image),
        );
        const text = result.data.text.trim();
        if (text) {
          pages.push({ pageNumber, text });
        }
      }
      return {
        content: pages
          .map((page) => `[Page ${page.pageNumber}]\n${page.text}`)
          .join('\n\n'),
        pages,
      };
    } finally {
      await worker.terminate();
    }
  }

  private async extractImageWithOcr(file: Buffer): Promise<string> {
    validateFile(file);
    const worker = await createWorker(['ita', 'eng']);
    try {
      const result = await worker.recognize(file);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  }
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

function validateOfficeArchive(file: Buffer, requiredFiles: string[]): void {
  const minimumOffset = Math.max(0, file.length - 65_557);
  let eocdOffset = -1;
  for (let offset = file.length - 22; offset >= minimumOffset; offset -= 1) {
    if (file.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new BadRequestException('Office document archive is invalid');
  }

  const entryCount = file.readUInt16LE(eocdOffset + 10);
  const directorySize = file.readUInt32LE(eocdOffset + 12);
  let offset = file.readUInt32LE(eocdOffset + 16);
  if (
    entryCount > 2000 ||
    directorySize === 0xffffffff ||
    offset === 0xffffffff ||
    offset + directorySize > eocdOffset
  ) {
    throw new BadRequestException(
      'Office document archive exceeds supported limits',
    );
  }

  let totalExpandedBytes = 0;
  let hasContentTypes = false;
  let hasMainDocument = false;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > eocdOffset || file.readUInt32LE(offset) !== 0x02014b50) {
      throw new BadRequestException('Office document archive is invalid');
    }

    const flags = file.readUInt16LE(offset + 8);
    const uncompressedSize = file.readUInt32LE(offset + 24);
    const fileNameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd + extraLength + commentLength > eocdOffset || flags & 0x0001) {
      throw new BadRequestException(
        'Office document archive contains unsupported entries',
      );
    }

    const entryName = file.subarray(nameStart, nameEnd).toString('utf8');
    if (
      entryName.startsWith('/') ||
      entryName.includes('..') ||
      entryName.includes('\\')
    ) {
      throw new BadRequestException(
        'Office document archive contains an unsafe path',
      );
    }
    totalExpandedBytes += uncompressedSize;
    if (
      uncompressedSize > 20 * 1024 * 1024 ||
      totalExpandedBytes > 50 * 1024 * 1024
    ) {
      throw new BadRequestException(
        'Office document archive expands beyond supported limits',
      );
    }
    hasContentTypes ||= entryName === '[Content_Types].xml';
    hasMainDocument ||= requiredFiles.includes(entryName);
    offset = nameEnd + extraLength + commentLength;
  }

  if (!hasContentTypes || !hasMainDocument) {
    throw new BadRequestException(
      'Office document archive does not contain the expected files',
    );
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
