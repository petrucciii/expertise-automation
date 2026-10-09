import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from './user.type.js';

export interface UserCredentials {
  user: AuthenticatedUser;
  passwordHash: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AuthenticatedUser | null> {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: numericId, deleted_at: null },
      select: { id: true, email: true },
    });

    return user;
  }

  async findByEmail(email: string): Promise<AuthenticatedUser | null> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    return user;
  }

  async findCredentials(email: string): Promise<UserCredentials | null> {
    const normalizedEmail = normalizeEmail(email);
    const row = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deleted_at: null },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!row) {
      return null;
    }

    return {
      user: { id: row.id, email: row.email },
      passwordHash: row.passwordHash,
    };
  }

  async create(email: string, passwordHash: string): Promise<AuthenticatedUser> {
    return this.prisma.user.create({
      data: { email: normalizeEmail(email), passwordHash },
      select: { id: true, email: true },
    });
  }

  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
