import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EvidenceStatus } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CasesService } from './cases.service.js';

describe('CasesService evidence sources', () => {
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
