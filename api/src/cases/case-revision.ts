import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

/** The conditional update locks the case row and rechecks its revision after concurrent writes. */
export async function lockCaseRevision(
  transaction: Prisma.TransactionClient,
  caseId: string,
  ownerId: number,
  revision: number,
): Promise<void> {
  const locked = await transaction.case.updateMany({
    where: { id: caseId, ownerId, deletedAt: null, revision },
    data: { revision },
  });
  if (locked.count !== 1)
    throw new ConflictException(
      'Case changed during this operation. Reload it and retry.',
    );
}

/** Any content change invalidates approval and all artifacts from the preceding revision. */
export async function bumpCaseRevision(
  transaction: Prisma.TransactionClient,
  caseId: string,
): Promise<void> {
  const approved = await transaction.case.updateMany({
    where: { id: caseId, status: 'APPROVED' },
    data: { revision: { increment: 1 }, status: 'DRAFT' },
  });
  if (!approved.count)
    await transaction.case.update({
      where: { id: caseId },
      data: { revision: { increment: 1 } },
    });
}
