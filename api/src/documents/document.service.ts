import { ConflictException, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentExtractService } from './document-extract.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { GetDocumentDto } from './dto/get-document.dto.js';



@Injectable()
export class DocumentService {
    constructor(private readonly prismaService: PrismaService, private readonly documentExtract: DocumentExtractService) { }


    async uploadDocument(file: Express.Multer.File, dto: UploadDocumentDto): Promise<Object> {

        const hash = crypto.createHash('sha256').update(file.buffer).digest('hex'); // hash of the file

        const existing = await this.prismaService.document.findFirst({ where: { hash, deleted_at: null } });
        if (existing) {
            throw new ConflictException('Document already exists');
        }


        const uploadDir = path.join('documents', 'uploads'); // path to the folder where the file will be stored
        await fs.mkdir(uploadDir, { recursive: true });// Create the folder if it doesn't exist

        const filePath = path.join(uploadDir, `${Date.now()}-${file.originalname}`); // path to the file
        await fs.writeFile(filePath, file.buffer);

        const document = await this.prismaService.document.create({
            data: {
                ownerId: dto.ownerId,
                fileName: file.originalname,
                mimeType: file.mimetype,
                path: filePath,
                hash: hash,
            }
        });

        return {
            success: true
        };
    }

    //get documents by parameters, if none get all
    async getDocuments(dto?: GetDocumentDto): Promise<Object> {
        const where: any = {};
        if (dto?.fileName) {
            where.fileName = dto?.fileName;
        }
        where.deleted_at = null;

        let documents = await this.prismaService.document.findMany({
            where
        });

        return documents;
    }

    //get by uuid
    async getDocumentByUuid(dto: GetDocumentDto): Promise<Object> {
        const document = await this.prismaService.document.findUnique({
            where: { id: dto.id, deleted_at: null }
        });

        if (!document) {
            throw new NotFoundException('Document not found');
        }

        //String buffered file
        const content = Buffer.from(await fs.readFile(document.path)).toString('base64');
        Object.assign(document, { fileContent: content }); //Add buffer to response

        return document;
    }

    //soft delete
    async deleteDocument(dto: GetDocumentDto): Promise<Object> {
        const document = await this.prismaService.document.update({
            where: { id: dto.id, deleted_at: null },
            data: { deleted_at: new Date() }
        });

        if (!document) {
            throw new NotFoundException('Document not found');
        }

        return {
            success: true,
            message: "File deleted"
        };
    }

    async getText(dto: GetDocumentDto): Promise<any> {
        const documentObj = await this.prismaService.document.findUnique({
            where: { id: dto.id, deleted_at: null }
        });

        if (!documentObj) {
            throw new BadRequestException("Document not found!")
        }

        const file = await fs.readFile(documentObj.path)

        if (!documentObj) {
            throw new NotFoundException('Document not found');
        }

        if (documentObj.mimeType === "application/pdf") {
            return await this.documentExtract.extractPDF(file);  //need to create
        } else if (documentObj.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            return await this.documentExtract.extractDocx(file);
        } else {
            throw new BadRequestException("Invalid file type");
        }
    }
}