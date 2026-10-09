import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenService, type TokenPair } from '@nestjs/authentication';
import { CredentialsService } from './credentials.service.js';
import type { AuthenticatedUser } from '../users/user.type.js';
import { UsersRepository } from '../users/users.repository.js';
import { createHash } from 'node:crypto';
import { PrismaRefreshTokenStore } from './prisma-refresh-token.store.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly tokenService: TokenService,
    private readonly users: UsersRepository,
    private readonly refreshTokens: PrismaRefreshTokenStore,
  ) {}

  register(email: string, password: string): Promise<AuthenticatedUser> {
    return this.credentials.register(email, password);
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const user = await this.credentials.verify(email, password);
    if (!user) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const tokens = await this.tokenService.issue(String(user.id), {
      method: 'password',
    });

    return { user, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const record = await this.refreshTokens.getRefreshToken(
      // The authentication package uses base64url SHA-256 keys for opaque tokens.
      createHash('sha256').update(refreshToken).digest('base64url'),
    );
    if (record && !(await this.users.findById(record.userId))) {
      await this.tokenService.revoke(refreshToken);
      throw new UnauthorizedException('Account is no longer active');
    }
    return this.tokenService.refresh(refreshToken);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      // Unknown and malformed tokens resolve false; the response stays 204.
      await this.tokenService.revoke(refreshToken);
    }
  }

  logoutEverywhere(userId: number): Promise<void> {
    return this.tokenService.revokeAll(String(userId));
  }
}
