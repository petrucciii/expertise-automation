import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { DocumentModule } from '../documents/document.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CaseArtifactExportService } from './case-artifact-export.service.js';
import { CaseArtifactsController } from './case-artifacts.controller.js';
import { CaseArtifactsService } from './case-artifacts.service.js';
import { CaseExtractionController } from './case-extraction.controller.js';
import { CaseExtractionService } from './case-extraction.service.js';
import { CaseReportService } from './case-report.service.js';
import { CaseReviewService } from './case-review.service.js';
import { CasesController } from './cases.controller.js';
import { CasesService } from './cases.service.js';

@Module({
  imports: [PrismaModule, AiModule, DocumentModule],
  controllers: [
    CasesController,
    CaseArtifactsController,
    CaseExtractionController,
  ],
  providers: [
    CasesService,
    CaseReviewService,
    CaseReportService,
    CaseArtifactsService,
    CaseArtifactExportService,
    CaseExtractionService,
  ],
  exports: [CasesService],
})
export class CasesModule {}
