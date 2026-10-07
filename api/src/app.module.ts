import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { DocumentModule } from './documents/document.module.js';

@Module({
  imports: [PrismaModule, DocumentModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
