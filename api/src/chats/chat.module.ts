import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
