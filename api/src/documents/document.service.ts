import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GetDocumentDto } from './dto/get-document.dto.js';
import { parseEmailMetadata } from './eml-parser.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type FileFormat = {
  extension: string;
  mimeType: string;
  sourceMetadata?: Record<string, unknown>;
};

export type UploadedDocumentFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadDocument(file: UploadedDocumentFile, ownerId: number) {
    const displayName = sanitizeFileName(file.originalname);
    const format = detectFormat(file, displayName);
    const hash = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await this.prisma.document.findFirst({
      where: { hash, ownerId, deleted_at: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Document already exists');
    }

    const storageDirectory = path.resolve(
      process.env.DOCUMENT_STORAGE_DIR ??
        path.join(process.cwd(), 'documents', 'uploads'),
    );
    await fs.mkdir(storageDirectory, { recursive: true, mode: 0o700 });

    const storedName = `${randomUUID()}${format.extension}`;
    const storedPath = path.resolve(storageDirectory, storedName);
    if (!storedPath.startsWith(`${storageDirectory}${path.sep}`)) {
      throw new BadRequestException('Invalid upload path');
    }

    await fs.writeFile(storedPath, file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      const document = await this.prisma.document.create({
        data: {
          ownerId,
          fileName: displayName,
          mimeType: format.mimeType,
          path: storedPath,
          hash,
          sourceMetadata: format.sourceMetadata
            ? (format.sourceMetadata as Prisma.InputJsonObject)
            : undefined,
        },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          extractionStatus: true,
          created_at: true,
        },
      });
      return document;
    } catch (error) {
      await fs.rm(storedPath, { force: true });
      throw error;
    }
  }

  async getDocuments(ownerId: number, dto?: GetDocumentDto) {
    return this.prisma.document.findMany({
      where: {
        ownerId,
        deleted_at: null,
        ...(dto?.fileName ? { fileName: dto.fileName } : {}),
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        extractionStatus: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getDownloadInfo(id: string, ownerId: number) {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId, deleted_at: null },
      select: { fileName: true, mimeType: true, path: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    try {
      await fs.access(document.path);
    } catch {
      throw new NotFoundException('Document file is not available');
    }
    return document;
  }

  async getOwnedDocument(id: string, ownerId: number) {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerId, deleted_at: null },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  async deleteDocument(dto: GetDocumentDto, ownerId: number) {
    if (!dto.id) {
      throw new BadRequestException('Document id is required');
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const linkedCases = await transaction.caseDocument.findMany({
        where: { documentId: dto.id },
        select: { caseId: true },
      });
      const deletedAt = new Date();
      const updated = await transaction.document.updateMany({
        where: { id: dto.id, ownerId, deleted_at: null },
        data: { deleted_at: deletedAt },
      });
      if (updated.count === 0) {
        return false;
      }
      await transaction.caseDocument.updateMany({
        where: { documentId: dto.id },
        data: { availability: 'REFERENCED_NOT_ACCESSIBLE' },
      });
      for (const caseId of new Set(linkedCases.map((row) => row.caseId))) {
        const approved = await transaction.case.updateMany({
          where: { id: caseId, status: 'APPROVED' },
          data: { revision: { increment: 1 }, status: 'DRAFT' },
        });
        if (!approved.count) {
          await transaction.case.update({
            where: { id: caseId },
            data: { revision: { increment: 1 } },
          });
        }
      }
      return true;
    });

    if (!result) {
      throw new NotFoundException('Document not found');
    }
    return { success: true };
  }
}

export function sanitizeFileName(originalName: string): string {
  const leaf = path.basename(originalName.replace(/\\/g, '/'));
  const cleaned = leaf.replace(/[<>:"|?*]/g, '_').trim();
  const withoutControls = cleaned.replace(/\p{Cc}/gu, '');
  if (!withoutControls || withoutControls === '.' || withoutControls === '..') {
    throw new BadRequestException('File name is invalid');
  }
  return withoutControls.slice(-240);
}

export function detectFormat(
  file: UploadedDocumentFile,
  fileName: string,
): FileFormat {
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new BadRequestException('Uploaded file is empty');
  }
  if (file.buffer.length > MAX_FILE_SIZE) {
    throw new BadRequestException('File exceeds the 10 MB limit');
  }

  const extension = path.extname(fileName).toLowerCase();
  const suppliedMime = file.mimetype.toLowerCase();
  const bytes = file.buffer;

  if (
    extension === '.pdf' &&
    bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return { extension, mimeType: 'application/pdf' };
  }
  if (
    extension === '.docx' &&
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (suppliedMime === DOCX_MIME || suppliedMime === 'application/octet-stream')
  ) {
    return { extension, mimeType: DOCX_MIME };
  }
  if (
    extension === '.png' &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension, mimeType: 'image/png' };
  }
  if (
    ['.jpg', '.jpeg'].includes(extension) &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { extension, mimeType: 'image/jpeg' };
  }
  if (
    ['.tif', '.tiff'].includes(extension) &&
    (bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
      bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))
  ) {
    return { extension, mimeType: 'image/tiff' };
  }
  if (extension === '.eml') {
    const metadata = parseEmailMetadata(bytes.toString('utf8'));
    return { extension, mimeType: 'message/rfc822', sourceMetadata: metadata };
  }

  throw new BadRequestException(
    'Supported files are PDF, DOCX, PNG, JPEG, TIFF, and EML',
  );
}
