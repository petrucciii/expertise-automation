import { BadRequestException, Injectable } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import mammoth from "mammoth";

type ExtractedDocument = {
    content: string;
};

@Injectable()
export class DocumentExtractService {
    async extractPDF(file: Buffer): Promise<ExtractedDocument> {
        this.validateFile(file);

        // Copia il buffer per lasciare intatto quello ricevuto dal servizio.
        const parser = new PDFParse({ data: Uint8Array.from(file) });

        try {
            let text: string;

            try {
                text = (await parser.getText()).text;
            } catch {
                throw new BadRequestException("PDF non valido o illeggibile");
            }

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
            throw new BadRequestException("DOCX non valido o illeggibile");
        }
    }

    private async extractPDFWithOCR(parser: PDFParse): Promise<string> {
        const info = await parser.getInfo({ parsePageInfo: true });

        if (info.total === 0) {
            throw new BadRequestException("Il PDF non contiene pagine");
        }

        const worker = await createWorker(["ita", "eng"]);

        try {
            const pageTexts: string[] = [];

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
            throw new BadRequestException("File vuoto o non valido");
        }
    }
}