import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import * as fs from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseEmail } from './eml-parser.js';

const MAX_PDF_PAGES = 200;
const MAX_EXTRACTED_CHARACTERS = 2_000_000;

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

    const extracted = await this.extract(document.mimeType, buffer);
    const content = extracted.content.slice(0, MAX_EXTRACTED_CHARACTERS);
    const truncated = extracted.content.length > MAX_EXTRACTED_CHARACTERS;
    const extractionStatus =
      truncated || content.trim().length < 10 ? 'NEEDS_REVIEW' : 'EXTRACTED';

    const saved = await this.prisma.document.updateMany({
      where: { id, ownerId, deleted_at: null },
      data: {
        extractedText: content,
        extractedPages: extracted.pages
          ? (extracted.pages as unknown as Prisma.InputJsonArray)
          : Prisma.DbNull,
        extractionStatus,
      },
    });
    if (!saved.count) {
      throw new NotFoundException('Document not found');
    }

    return {
      documentId: document.id,
      content,
      pages: extracted.pages ?? null,
      extractionStatus,
      sourceMetadata: document.sourceMetadata,
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
    validateDocxArchive(file);
    try {
      const result = await mammoth.extractRawText({ buffer: file });
      return { content: result.value };
    } catch {
      throw new BadRequestException('DOCX is not valid or cannot be read');
    }
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

function validateFile(file: Buffer): void {
  if (!Buffer.isBuffer(file) || file.length === 0) {
    throw new BadRequestException('Document file is invalid');
  }
}

function validateDocxArchive(file: Buffer): void {
  const minimumOffset = Math.max(0, file.length - 65_557);
  let eocdOffset = -1;
  for (let offset = file.length - 22; offset >= minimumOffset; offset -= 1) {
    if (file.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new BadRequestException('DOCX archive is invalid');
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
    throw new BadRequestException('DOCX archive exceeds supported limits');
  }

  let totalExpandedBytes = 0;
  let hasContentTypes = false;
  let hasMainDocument = false;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > eocdOffset || file.readUInt32LE(offset) !== 0x02014b50) {
      throw new BadRequestException('DOCX archive is invalid');
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
        'DOCX archive contains unsupported entries',
      );
    }

    const entryName = file.subarray(nameStart, nameEnd).toString('utf8');
    if (
      entryName.startsWith('/') ||
      entryName.includes('..') ||
      entryName.includes('\\')
    ) {
      throw new BadRequestException('DOCX archive contains an unsafe path');
    }
    totalExpandedBytes += uncompressedSize;
    if (
      uncompressedSize > 20 * 1024 * 1024 ||
      totalExpandedBytes > 50 * 1024 * 1024
    ) {
      throw new BadRequestException(
        'DOCX archive expands beyond supported limits',
      );
    }
    hasContentTypes ||= entryName === '[Content_Types].xml';
    hasMainDocument ||= entryName === 'word/document.xml';
    offset = nameEnd + extraLength + commentLength;
  }

  if (!hasContentTypes || !hasMainDocument) {
    throw new BadRequestException('File is not a valid DOCX document');
  }
}
