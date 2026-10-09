import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentAvailability,
  EvidenceStatus,
  Prisma,
} from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CasesService } from './cases.service.js';

describe('CasesService evidence sources', () => {
  it('does not accept unsourced shipment fields as case facts', async () => {
    const create = vi.fn().mockImplementation(({ data }) => data);
    const service = new CasesService({
      case: { create },
    } as unknown as PrismaService);

    await service.create(1, {
      title: 'Case intake',
      assignment: { client: 'Client A', requestedScope: ['Survey'] },
      transportMode: 'SEA',
      origin: 'Port A',
      parties: { carrier: 'Carrier B' },
    } as unknown as import('./dto/case.dto.js').CreateCaseDto);

    const data = create.mock.calls[0][0].data;
    expect(data.shipment).toBe(Prisma.JsonNull);
    expect(data.parties).toBe(Prisma.JsonNull);
    expect(data.damageAssessment).toBe(Prisma.JsonNull);
    expect(data.assignment).toMatchObject({
      client: 'Client A',
      requestedScope: ['Survey'],
    });
  });

  it('requires a registered source for a non-unknown fact', async () => {
    const prisma = {
      case: { findFirst: vi.fn().mockResolvedValue({ id: 'case-1' }) },
      caseDocument: { findMany: vi.fn().mockResolvedValue([]) },
      caseEvidence: { create: vi.fn() },
    };
    const service = new CasesService(prisma as unknown as PrismaService);

    await expect(
      service.addEvidence('case-1', 1, {
        fieldKey: 'shipment.carton_count',
        value: 1080,
        epistemicStatus: EvidenceStatus.STATED_IN_DOCUMENT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.caseEvidence.create).not.toHaveBeenCalled();
  });

  it('does not accept client-supplied calculated evidence', async () => {
    const prisma = {
      case: { findFirst: vi.fn().mockResolvedValue({ id: 'case-1' }) },
      caseEvidence: { create: vi.fn() },
    };
    const service = new CasesService(prisma as unknown as PrismaService);

    await expect(
      service.addEvidence('case-1', 1, {
        fieldKey: 'temperature.mean',
        value: 5,
        unit: 'C',
        epistemicStatus: EvidenceStatus.CALCULATED,
        sources: [{ sourceCode: 'DOC-001' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.caseEvidence.create).not.toHaveBeenCalled();
  });

  it('requires excerpt-only document entries to include retrievable source text', async () => {
    const prisma = {
      case: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'case-1',
          status: 'INTAKE',
          revision: 1,
        }),
      },
      $transaction: vi.fn(),
    };
    const service = new CasesService(prisma as unknown as PrismaService);

    await expect(
      service.attachDocument('case-1', 1, {
        availability: DocumentAvailability.EXCERPT_ONLY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores a registered excerpt separately from the unavailable original', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'case-document-1',
      sourceCode: 'DOC-001',
      excerptText: 'Recorded excerpt from the source document.',
    });
    const transaction = {
      case: {
        update: vi.fn().mockResolvedValue({ nextDocumentNumber: 2 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      caseDocument: { create },
    };
    const prisma = {
      case: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'case-1',
          status: 'INTAKE',
          revision: 1,
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new CasesService(prisma as unknown as PrismaService);

    await service.attachDocument('case-1', 1, {
      availability: DocumentAvailability.EXCERPT_ONLY,
      excerptText: '  Recorded excerpt from the source document.  ',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          availability: 'EXCERPT_ONLY',
          excerptText: 'Recorded excerpt from the source document.',
        }),
      }),
    );
  });

  it('keeps an unknown fact without inventing a source', async () => {
    const created = {
      id: 'evidence-1',
      epistemicStatus: EvidenceStatus.UNKNOWN,
    };
    const evidenceCreate = vi.fn().mockResolvedValue(created);
    const prisma = {
      case: { findFirst: vi.fn().mockResolvedValue({ id: 'case-1' }) },
      caseDocument: { findMany: vi.fn().mockResolvedValue([]) },
      caseEvidence: { create: evidenceCreate },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          caseEvidence: { create: evidenceCreate },
          case: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn(),
          },
        }),
      ),
    };
    const service = new CasesService(prisma as unknown as PrismaService);

    await expect(
      service.addEvidence('case-1', 1, {
        fieldKey: 'damage.quantification',
        value: 'not available',
        epistemicStatus: EvidenceStatus.UNKNOWN,
      }),
    ).resolves.toEqual(created);
    expect(evidenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ caseId: 'case-1' }),
      }),
    );
  });
});
