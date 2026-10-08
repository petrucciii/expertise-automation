import { Body, Controller, FileTypeValidator, MaxFileSizeValidator, ParseFilePipe, Query, Post, Get, Param, UploadedFile, UseInterceptors } from "@nestjs/common";
import { DocumentService } from "./document.service.js";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadDocumentDto } from "./dto/upload-document.dto.js"
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

    @Get(':uuid/download')
    async getDocumentByUuid(
        @Param('uuid') uuid: string
    ): Promise<Object> {
        return this.documentService.getDocumentByUuid(uuid);
    }

    @Get()
    async getDocuments(@Query('name') name?: string): Promise<Object> {
        return this.documentService.getDocuments(name);
    }


}


