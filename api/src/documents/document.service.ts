import { ConflictException, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { GetDocumentDto } from './dto/get-document.dto.js';



@Injectable()
export class DocumentService {
    constructor(private readonly prismaService: PrismaService) { }
    
    async uploadDocument(file: Express.Multer.File, ownerId: number): Promise<Object> {

        const hash = crypto.createHash('sha256').update(file.buffer).digest('hex'); // hash of the file

        const existing = await this.prismaService.document.findFirst({ where: { hash, ownerId, deleted_at: null } });
        if (existing) {
            throw new ConflictException('Document already exists');
        }


        const uploadDir = path.join('documents', 'uploads'); // path to the folder where the file will be stored
        await fs.mkdir(uploadDir, { recursive: true });// Create the folder if it doesn't exist

        const filePath = path.join(uploadDir, `${Date.now()}-${file.originalname}`); // path to the file
        await fs.writeFile(filePath, file.buffer);

        const document = await this.prismaService.document.create({
            data: {
                ownerId,
                fileName: file.originalname,
                mimeType: file.mimetype,
                path: filePath,
                hash: hash,
            }
        });

        return {
            id: document.id,
            fileName: document.fileName,
            mimeType: document.mimeType,
            created_at: document.created_at,
        };
    }

    //get documents by parameters, if none get all
    async getDocuments(ownerId: number, dto?: GetDocumentDto): Promise<Object> {
        const where: { ownerId: number; fileName?: string; deleted_at: null } = {
            ownerId,
            deleted_at: null,
        };
        if (dto?.fileName) {
            where.fileName = dto?.fileName;
        }
        where.deleted_at = null;

        const documents = await this.prismaService.document.findMany({
            where,
            select: {
                id: true,
                fileName: true,
                mimeType: true,
                created_at: true,
                updated_at: true,
            },
        });

        return documents;
    }

    //get by uuid
    async getDocumentByUuid(dto: GetDocumentDto, ownerId: number): Promise<Object> {
        if (!dto.id) {
            throw new BadRequestException('Document id is required');
        }

        const document = await this.prismaService.document.findFirst({
            where: { id: dto.id, ownerId, deleted_at: null },
        });

        if (!document) {
            throw new NotFoundException('Document not found');
        }

        //String buffered file
        const content = Buffer.from(await fs.readFile(document.path)).toString('base64');
        return {
            id: document.id,
            fileName: document.fileName,
            mimeType: document.mimeType,
            created_at: document.created_at,
            fileContent: content,
        };
    }

    //soft delete
    async deleteDocument(dto: GetDocumentDto, ownerId: number): Promise<Object> {
        if (!dto.id) {
            throw new BadRequestException('Document id is required');
        }

        const result = await this.prismaService.document.updateMany({
            where: { id: dto.id, ownerId, deleted_at: null },
            data: { deleted_at: new Date() }
        });

        if (result.count === 0) {
            throw new NotFoundException('Document not found');
        }

        return {
            success: true,
            message: "File deleted"
        };
    }

}
