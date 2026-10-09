import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { DocumentExtractService } from '../src/documents/document-extract.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

// This opt-in smoke test uses real Tesseract workers and downloads language data on its first run.
// It sends no case data to an AI provider and never connects to the application's database.
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), 'expertise-ocr-live-'),
);
try {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="56" fill="black"><text x="60" y="120">ROAD CARGO SURVEY TEST</text><text x="60" y="230">CMR TEST 031</text><text x="60" y="340">24 PALLETS RECEIVED</text><text x="60" y="450">CAUSE NOT VERIFIED</text></g></svg>',
  );
  for (const format of ['png', 'jpeg', 'tiff'] as const) {
    const bytes = await sharp(svg).toFormat(format).toBuffer();
    const filePath = path.join(directory, `survey.${format}`);
    await fs.writeFile(filePath, bytes);
    const prisma = {
      document: {
        findFirst: async () => ({
          id: 'synthetic-original',
          path: filePath,
          hash: createHash('sha256').update(bytes).digest('hex'),
          mimeType: `image/${format}`,
          extractedText: null,
          sourceMetadata: null,
        }),
      },
      $transaction: async (callback: (transaction: unknown) => unknown) =>
        callback({
          document: { updateMany: async () => ({ count: 1 }) },
          caseDocument: { findMany: async () => [] },
        }),
    } as unknown as PrismaService;
    const extracted = await new DocumentExtractService(prisma).getText(
      'synthetic-original',
      1,
    );
    assert.equal(extracted.extractionStatus, 'NEEDS_REVIEW');
    assert.match(extracted.content, /24\s+PALLETS\s+RECEIVED/i);
    assert.match(extracted.content, /CAUSE\s+NOT\s+VERIFIED/i);
    console.log(
      `${format.toUpperCase()}: real OCR passed; text requires human review.`,
    );
  }
} finally {
  const absolute = path.resolve(directory);
  if (
    path.dirname(absolute) === path.resolve(os.tmpdir()) &&
    path.basename(absolute).startsWith('expertise-ocr-live-')
  )
    await fs.rm(absolute, { recursive: true, force: true });
}
