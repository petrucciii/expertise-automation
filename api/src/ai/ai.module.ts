import { Module } from '@nestjs/common';
import { GeminiGenerateContentService } from './gemini-generate-content.service.js';

@Module({
  providers: [GeminiGenerateContentService],
  exports: [GeminiGenerateContentService],
})
export class AiModule {}
