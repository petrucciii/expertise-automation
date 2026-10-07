import { ConflictException, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';


@Injectable()
export class DocumentService {
    constructor(private readonly prismaService: PrismaService) { }


    async uploadDocument(file: Express.Multer.File, ownerId: number): Promise<Object> {

        const hash = crypto.createHash('sha256').update(file.buffer).digest('hex'); // hash of the file

        const existing = await this.prismaService.document.findFirst({ where: { hash } });
        if (existing) {
            throw new ConflictException('Document already exists');
        }


        const uploadDir = path.join(process.cwd(), 'documents', 'uploads'); // path to the folder where the file will be stored
        await fs.mkdir(uploadDir, { recursive: true });// Create the folder if it doesn't exist

        const filePath = path.join(uploadDir, `${Date.now()}-${file.originalname}`); // path to the file
        await fs.writeFile(filePath, file.buffer);

        const dto: UploadDocumentDto = {
            ownerId: ownerId,
            fileName: file.originalname,
            mimeType: file.mimetype,
            path: filePath,
            hash: hash,
        }

        const document = await this.prismaService.document.create({
            data: dto
        });

        return {
            success: true
        };
    }

    async getDocuments(name?: string): Promise<Object> {
        const where: any = {};
        if (name) {
            where.fileName = name;
        }
        const documents = await this.prismaService.document.findMany({
            where
        });
        return documents;
    }

    async getDocumentByUuid(uuid: string): Promise<Object> {
        const document = await this.prismaService.document.findUnique({
            where: { id: uuid }
        });

        if (!document) {
            throw new NotFoundException('Document not found');
        }
        return document;
    }
}