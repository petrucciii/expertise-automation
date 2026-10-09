import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { DocumentModule } from './documents/document.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CasesModule } from './cases/cases.module.js';
import { ChatModule } from './chats/chat.module.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes of random data');
}

@Module({
  imports: [
    // Register this before AuthModule: it provides the global auth guard and
    // the token/password services used by our providers.
    AuthenticationModule.forRoot({
      accessToken: {
        key: jwtSecret,
        issuer: process.env.JWT_ISSUER ?? 'expertise-automation-api',
        audience: process.env.JWT_AUDIENCE ?? 'expertise-automation-web',
        ttl: '15m',
      },
      refreshToken: {
        ttl: '30d',
        absoluteTtl: '90d',
      },
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    CasesModule,
    ChatModule,
    DocumentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
