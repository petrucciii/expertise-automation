import {
  Body,
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
import { DocumentService } from './document.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadDocumentDto } from './dto/upload-document.dto.js';
import { GetDocumentDto } from './dto/get-document.dto.js';
import 'multer';
import { DocumentExtractService } from './document-extract.service.js';

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
    @Body() dto: UploadDocumentDto,
  ): Promise<Object> {
    return this.documentService.uploadDocument(file, dto);
  }

  //GET api/documents/c201f-019d/download
  @Get(':id/download')
  async getDocumentByUuid(@Param() dto: GetDocumentDto): Promise<Object> {
    return this.documentService.getDocumentByUuid(dto);
  }

  //GET api/documents/c201f-019d/content
  @Get(':id/content')
  async getDocumentContentByUuid(
    @Param() dto: GetDocumentDto,
  ): Promise<Object> {
    return this.documentExtractService.getText(dto);
  }

  //GET api/documents?fileName=doc.pdf
  @Get()
  async getDocuments(@Query() dto?: GetDocumentDto): Promise<Object> {
    return this.documentService.getDocuments(dto);
  }

  //DELETE /api/documents/c201f-019d
  @Delete(':id')
  async deleteDocument(@Param() dto: GetDocumentDto): Promise<Object> {
    return this.documentService.deleteDocument(dto);
  }
}
