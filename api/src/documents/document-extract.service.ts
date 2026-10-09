import { BadRequestException, NotFoundException, Injectable } from "@nestjs/common";
import { GetDocumentDto  } from "./dto/get-document.dto.js";
import { PrismaService } from '../prisma/prisma.service.js'
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import mammoth from "mammoth";
import fs from 'fs/promises'

type ExtractedDocument = {
    content: string;
};

@Injectable()
export class DocumentExtractService {
    constructor(private readonly prismaService: PrismaService) { }


     async getText(dto: GetDocumentDto, ownerId: number): Promise<ExtractedDocument> {
        if (!dto.id) {
            throw new BadRequestException('Document id is required');
        }

        const documentObj = await this.prismaService.document.findFirst({
            where: { id: dto.id, ownerId, deleted_at: null }
        });

        if (!documentObj) {
            throw new NotFoundException('Document not found');
        }

        const file = await fs.readFile(documentObj.path)

        if (documentObj.mimeType === "application/pdf") {
            return await this.extractPDF(file);  //need to create
        } else if (documentObj.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            return await this.extractDocx(file);
        } else {
            throw new BadRequestException("Invalid file type");
        }
    }


    async extractPDF(file: Buffer): Promise<ExtractedDocument> {
        this.validateFile(file);

        // Copies buffer so that the one passed by the service remains intact
        const parser = new PDFParse({ data: Uint8Array.from(file) });

        try {
            let text: string;

            try {
                text = (await parser.getText()).text;
            } catch {
                throw new BadRequestException("PDF not valid or unreadable");
            }

            //fallback
            if (text.trim().length < 50) {
                return {
                    content: await this.extractPDFWithOCR(parser),
                };
            }

            return { content: text };
        } finally {
            await parser.destroy();
        }
    }

    async extractDocx(file: Buffer): Promise<ExtractedDocument> {
        this.validateFile(file);

        try {
            const result = await mammoth.extractRawText({ buffer: file });
            return { content: result.value };
        } catch {
            throw new BadRequestException("DOCX Not Valid or Unreadable");
        }
    }

    //Fallback with OCR
    private async extractPDFWithOCR(parser: PDFParse): Promise<string> {
        const info = await parser.getInfo({ parsePageInfo: true });

        if (info.total === 0) {
            throw new BadRequestException("PDF does not contain pages");
        }

        const worker = await createWorker(["ita", "eng"]);

        try {
            const pageTexts: string[] = [];

            //For each page extract image
            for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
                const rendered = await parser.getScreenshot({
                    partial: [pageNumber],
                    scale: 2,
                    imageBuffer: true,
                    imageDataUrl: false,
                });

                const image = rendered.pages[0]?.data;

                if (!image) {
                    continue;
                }

                const imageBuffer = Buffer.isBuffer(image)
                    ? image
                    : Buffer.from(image);

                //OCR
                const result = await worker.recognize(imageBuffer);
                const pageText = result.data.text.trim();

                if (pageText) {
                    pageTexts.push(pageText);
                }
            }

            return pageTexts.join("\n\n");
        } finally {
            await worker.terminate();
        }
    }

    private validateFile(file: Buffer): void {
        if (!Buffer.isBuffer(file) || file.length === 0) {
            throw new BadRequestException("File not valid");
        }
    }
}
