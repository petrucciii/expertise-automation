import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CredentialsService } from './credentials.service.js';
import { JwtAuthProvider } from './jwt-auth.provider.js';
import { PrismaRefreshTokenStore } from './prisma-refresh-token.store.js';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CredentialsService,
    JwtAuthProvider,
    PrismaRefreshTokenStore,
  ],
})
export class AuthModule {}
