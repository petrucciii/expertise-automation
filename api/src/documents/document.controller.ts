import {
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Query,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Delete,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { DocumentService } from './document.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetDocumentDto } from './dto/get-document.dto.js';
import 'multer';
import { DocumentExtractService } from './document-extract.service.js';
import type { AuthenticatedUser } from '../users/user.type.js';

@Controller('documents')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly documentExtractService: DocumentExtractService,
  ) {}

  //POST api/documents/upload
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          // Only accept pdf and docx based on regex
          new FileTypeValidator({
            fileType:
              /(pdf|vnd.openxmlformats-officedocument.wordprocessingml.document)/,
          }),
          // Max file size of 10MB
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<Object> {
    return this.documentService.uploadDocument(file, user.id);
  }

  //GET api/documents/c201f-019d/download
  @Get(':id/download')
  async getDocumentByUuid(
    @Param() dto: GetDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Object> {
    return this.documentService.getDocumentByUuid(dto, user.id);
  }

  //GET api/documents/c201f-019d/content
  @Get(':id/content')
  async getDocumentContentByUuid(
    @Param() dto: GetDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Object> {
    return this.documentExtractService.getText(dto, user.id);
  }

  //GET api/documents?fileName=doc.pdf
  @Get()
  async getDocuments(
    @Query() dto: GetDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Object> {
    return this.documentService.getDocuments(user.id, dto);
  }

  //DELETE /api/documents/c201f-019d
  @Delete(':id')
  async deleteDocument(
    @Param() dto: GetDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Object> {
    return this.documentService.deleteDocument(dto, user.id);
  }
}
