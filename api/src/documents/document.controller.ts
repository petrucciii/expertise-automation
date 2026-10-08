import { Body, Controller, FileTypeValidator, MaxFileSizeValidator, ParseFilePipe, Query, Post, Get, Param, UploadedFile, UseInterceptors, Delete, HttpStatus, HttpCode } from "@nestjs/common";
import { DocumentService } from "./document.service.js";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadDocumentDto } from "./dto/upload-document.dto.js"
import { GetDocumentDto } from "./dto/get-document.dto.js"
import 'multer';
;

@Controller('documents')
export class DocumentController {
    constructor(private readonly documentService: DocumentService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadDocument(
        @UploadedFile(new ParseFilePipe({
            validators: [
                // Only accept pdf and docx based on regex
                new FileTypeValidator({
                    fileType: /(pdf|vnd.openxmlformats-officedocument.wordprocessingml.document)/
                }),
                // Max file size of 10MB
                new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
            ],
        }),) file: Express.Multer.File,
        @Body() dto: UploadDocumentDto): Promise<Object> {

        return this.documentService.uploadDocument(file, dto);
    }

    @Get(':id/download')
    async getDocumentByUuid(
        @Param() dto: GetDocumentDto
    ): Promise<Object> {
        return this.documentService.getDocumentByUuid(dto);
    }

    @Get(':id/content')
    async getDocumentContentByUuid(
        @Param() dto: GetDocumentDto
    ): Promise<Object> {
        return this.documentService.getText(dto);
    }

    @Get()
    async getDocuments(@Query() dto?: GetDocumentDto): Promise<Object> {
        return this.documentService.getDocuments(dto);
    }

    @Delete(':id')
    async deleteDocument(@Param() dto: GetDocumentDto): Promise<Object> {
        return this.documentService.deleteDocument(dto);
    }

}


