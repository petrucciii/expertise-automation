import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationDto } from '../common/pagination.dto.js';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthenticatedUser } from '../users/user.type.js';
import {
  AttachCaseDocumentDto,
  CreateCaseDto,
  CreateCaseEventDto,
  CreateCaseEvidenceDto,
  CreateCaseIssueDto,
  UpdateCaseDto,
  UpdateCaseIssueDto,
} from './dto/case.dto.js';
import { CasesService } from './cases.service.js';

@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCaseDto) {
    return this.cases.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.cases.list(user.id, pagination);
  }

  @Get(':caseId')
  get(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.get(caseId, user.id);
  }

  @Patch(':caseId')
  update(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCaseDto,
  ) {
    return this.cases.update(caseId, user.id, dto);
  }

  @Post(':caseId/documents')
  @HttpCode(HttpStatus.CREATED)
  attachDocument(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AttachCaseDocumentDto,
  ) {
    return this.cases.attachDocument(caseId, user.id, dto);
  }

  @Get(':caseId/document-register')
  documentRegister(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.documentRegister(caseId, user.id);
  }

  @Post(':caseId/events')
  @HttpCode(HttpStatus.CREATED)
  addEvent(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCaseEventDto,
  ) {
    return this.cases.addEvent(caseId, user.id, dto);
  }

  @Post(':caseId/evidence')
  @HttpCode(HttpStatus.CREATED)
  addEvidence(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCaseEvidenceDto,
  ) {
    return this.cases.addEvidence(caseId, user.id, dto);
  }

  @Post(':caseId/issues')
  @HttpCode(HttpStatus.CREATED)
  addIssue(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCaseIssueDto,
  ) {
    return this.cases.addIssue(caseId, user.id, dto);
  }

  @Patch(':caseId/issues/:issueId')
  updateIssue(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCaseIssueDto,
  ) {
    return this.cases.updateIssue(caseId, user.id, issueId, dto);
  }
}
