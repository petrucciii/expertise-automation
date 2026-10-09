import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { UsersRepository, normalizeEmail } from '../users/users.repository.js';
import type { AuthenticatedUser } from '../users/user.type.js';

@Injectable()
export class CredentialsService implements OnModuleInit {
  private dummyBcryptHash = '';

  constructor(
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async onModuleInit(): Promise<void> {
    // The seed used bcrypt. Check a dummy bcrypt hash on non-bcrypt accounts
    // while old hashes are upgraded at the next successful login.
    this.dummyBcryptHash = await bcrypt.hash(
      randomBytes(32).toString('base64url'),
      10,
    );
  }

  async register(email: string, password: string): Promise<AuthenticatedUser> {
    const normalizedEmail = normalizeEmail(email);
    if (await this.users.findByEmail(normalizedEmail)) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordHasher.hash(password);
    try {
      return await this.users.create(normalizedEmail, passwordHash);
    } catch (error) {
      // The unique constraint also handles two sign-ups racing each other.
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async verify(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const found = await this.users.findCredentials(email);
    const storedHash = found?.passwordHash;
    const isLegacyBcrypt = storedHash?.startsWith('$2') ?? false;
    const isCurrentScrypt = storedHash?.startsWith('$scrypt$') ?? false;

    // Unknown users and legacy accounts still pay the current scrypt cost.
    const scryptMatches = await this.passwordHasher.verify(
      password,
      isCurrentScrypt ? storedHash : undefined,
    );
    // Do the same bcrypt work for all accounts to reduce timing differences
    // while accounts seeded with the old bcrypt scheme are being upgraded.
    const bcryptMatches = await bcrypt.compare(
      password,
      isLegacyBcrypt ? storedHash! : this.dummyBcryptHash,
    );

    const passwordMatches = isLegacyBcrypt
      ? bcryptMatches
      : isCurrentScrypt && scryptMatches;

    if (!found || !passwordMatches) {
      return null;
    }

    if (isLegacyBcrypt || this.passwordHasher.needsRehash(storedHash!)) {
      const upgradedHash = await this.passwordHasher.hash(password);
      await this.users.updatePasswordHash(found.user.id, upgradedHash);
    }

    return found.user;
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
