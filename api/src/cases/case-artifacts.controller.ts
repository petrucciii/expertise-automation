import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { CaseArtifactType } from '../generated/prisma/client.js';
import type { AuthenticatedUser } from '../users/user.type.js';
import {
  GenerateArtifactDto,
  SaveArtifactRevisionDto,
} from './dto/artifact.dto.js';
import { CaseArtifactsService } from './case-artifacts.service.js';
import { CaseArtifactExportService } from './case-artifact-export.service.js';

@Controller('cases/:caseId/artifacts')
export class CaseArtifactsController {
  constructor(
    private readonly artifacts: CaseArtifactsService,
    private readonly artifactExport: CaseArtifactExportService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generateAll(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.artifacts.generateAll(caseId, user.id);
  }

  @Post(':type/generate')
  @HttpCode(HttpStatus.CREATED)
  generate(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('type', new ParseEnumPipe(CaseArtifactType)) type: CaseArtifactType,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateArtifactDto,
  ) {
    return this.artifacts.generate(caseId, user.id, type, dto);
  }

  @Get()
  list(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.artifacts.list(caseId, user.id);
  }

  @Get(':type/latest')
  getLatest(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('type', new ParseEnumPipe(CaseArtifactType)) type: CaseArtifactType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.artifacts.getLatest(caseId, user.id, type);
  }

  @Get(':type/versions')
  listVersions(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('type', new ParseEnumPipe(CaseArtifactType)) type: CaseArtifactType,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.artifacts.listVersions(caseId, user.id, type);
  }

  @Post(':type/revisions')
  @HttpCode(HttpStatus.CREATED)
  saveManualRevision(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('type', new ParseEnumPipe(CaseArtifactType)) type: CaseArtifactType,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveArtifactRevisionDto,
  ) {
    return this.artifacts.saveManualRevision(caseId, user.id, type, dto);
  }

  @Get(':type/latest/export')
  async exportLatest(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('type', new ParseEnumPipe(CaseArtifactType)) type: CaseArtifactType,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const result = await this.artifactExport.exportLatest(
      caseId,
      user.id,
      type,
    );
    return new StreamableFile(result.buffer, {
      type: result.contentType,
      disposition: `attachment; filename="${result.fileName}"`,
    });
  }

  @Patch(':artifactId/approve')
  approve(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('artifactId', ParseUUIDPipe) artifactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.artifacts.approve(caseId, user.id, artifactId);
  }
}
