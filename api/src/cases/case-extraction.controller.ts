import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationDto } from '../common/pagination.dto.js';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthenticatedUser } from '../users/user.type.js';
import { CaseExtractionService } from './case-extraction.service.js';
import { CaseTabularAnalysisService } from './case-tabular-analysis.service.js';
import { CalculateNumericColumnDto } from '../documents/dto/calculate-numeric-column.dto.js';
import { AcceptExtractionDto } from './dto/extraction.dto.js';

@Controller('cases/:caseId')
export class CaseExtractionController {
  constructor(
    private readonly extraction: CaseExtractionService,
    private readonly tabularAnalysis: CaseTabularAnalysisService,
  ) {}

  @Post('documents/:sourceCode/calculations')
  @HttpCode(HttpStatus.CREATED)
  calculateColumn(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('sourceCode') sourceCode: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalculateNumericColumnDto,
  ) {
    return this.tabularAnalysis.calculateColumn(
      caseId,
      sourceCode,
      user.id,
      dto,
    );
  }

  @Post('documents/:sourceCode/extract')
  @HttpCode(HttpStatus.CREATED)
  createProposal(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('sourceCode') sourceCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.extraction.createProposal(caseId, sourceCode, user.id);
  }

  @Get('extractions')
  list(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.extraction.list(caseId, user.id, pagination);
  }

  @Post('extractions/:proposalId/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptExtractionDto,
  ) {
    return this.extraction.acceptSuggestions(caseId, proposalId, user.id, dto);
  }

  @Post('extractions/:proposalId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.extraction.rejectProposal(caseId, proposalId, user.id);
  }
}
