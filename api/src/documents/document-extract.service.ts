import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { PrismaPg } from "@prisma/adapter-pg";

import mammoth from "mammoth";
//import pdf from "pdf-parse";

@Injectable()
export class DocumentExtractService {
    /*async extractPDF(file: Express.Multer.File): Promise<Object> {

    }*/

    async extractDocx(file: Buffer): Promise<Object> {
        //mammoth gives error for empty file
        if (file.length === 0) {
            throw new BadRequestException("Empty file");
        }

        const result = await mammoth.extractRawText({ buffer: file });
        return { content: result.value };
    }
}