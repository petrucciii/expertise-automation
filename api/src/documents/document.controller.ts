import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  ParseUUIDPipe,
  Query,
  UploadedFile,
  UseInterceptors,
  Post,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service.js';
import type { UploadedDocumentFile } from './document.service.js';
import { DocumentExtractService } from './document-extract.service.js';
import { GetDocumentDto } from './dto/get-document.dto.js';
import type { AuthenticatedUser } from '../users/user.type.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Controller('documents')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly documentExtractService: DocumentExtractService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES })],
      }),
    )
    file: UploadedDocumentFile,
  ) {
    return this.documentService.uploadDocument(file, user.id);
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const document = await this.documentService.getDownloadInfo(id, user.id);
    return new StreamableFile(document.buffer, {
      type: document.mimeType,
      disposition: contentDisposition(document.fileName),
    });
  }

  @Get(':id/content')
  getDocumentContent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentExtractService.getText(id, user.id);
  }

  @Post(':id/extraction-review')
  @HttpCode(HttpStatus.OK)
  confirmExtractionReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentExtractService.confirmExtractionReview(id, user.id);
  }

  @Get()
  getDocuments(
    @Query() dto: GetDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentService.getDocuments(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentService.deleteDocument({ id }, user.id);
  }
}

function contentDisposition(fileName: string): string {
  const fallback = fileName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
