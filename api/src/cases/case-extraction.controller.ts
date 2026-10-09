import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthenticatedUser } from '../users/user.type.js';
import { CaseExtractionService } from './case-extraction.service.js';
import { AcceptExtractionDto } from './dto/extraction.dto.js';

@Controller('cases/:caseId')
export class CaseExtractionController {
  constructor(private readonly extraction: CaseExtractionService) {}

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
  ) {
    return this.extraction.list(caseId, user.id);
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
