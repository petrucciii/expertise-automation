import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type RefreshTokenRecord,
  type RefreshTokenStore,
} from '@nestjs/authentication';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Persists the package's refresh-token contract in PostgreSQL through Prisma. */
@Injectable()
export class PrismaRefreshTokenStore implements RefreshTokenStore {
  constructor(
    private readonly prisma: PrismaService,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      familyId: row.familyId,
      userId: String(row.userId),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      familyExpiresAt: row.familyExpiresAt,
      ...(row.usedAt ? { usedAt: row.usedAt } : {}),
      ...(row.claims && typeof row.claims === 'object'
        ? { claims: row.claims as Record<string, unknown> }
        : {}),
    };
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    const userId = Number(record.userId);
    if (
      !/^\d+$/.test(record.userId) ||
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      userId > 2147483647
    ) {
      throw new Error('Refresh token contains an invalid user id');
    }

    await this.prisma.refreshToken.create({
      data: {
        id: record.id,
        familyId: record.familyId,
        userId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        familyExpiresAt: record.familyExpiresAt,
        usedAt: record.usedAt ?? null,
        revoked: false,
        ...(record.claims
          ? { claims: record.claims as Prisma.InputJsonObject }
          : {}),
      },
    });

    // Keep records until their family expires so replay detection can still
    // see consumed or revoked predecessors.
    await this.prisma.refreshToken.deleteMany({
      where: { familyExpiresAt: { lte: record.createdAt } },
    });
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    // Compare-and-set: only one concurrent refresh can consume this row.
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, usedAt: null, revoked: false },
      data: { usedAt: at },
    });
    return result.count === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId },
      data: { revoked: true },
    });
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    const revokedToken = await this.prisma.refreshToken.findFirst({
      where: { familyId, revoked: true },
      select: { id: true },
    });
    return revokedToken !== null;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    const numericId = Number(userId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: numericId },
      data: { revoked: true },
    });
  }
}
