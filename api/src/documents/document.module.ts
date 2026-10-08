
import { Module, Global } from "@nestjs/common";
import { DocumentService } from "./document.service.js";
import { DocumentController } from "./document.controller.js";
import { DocumentExtractService } from "./document-extract.service.js";

@Global()
@Module({
    providers: [DocumentService, DocumentExtractService],
    controllers: [DocumentController],
    exports: [DocumentService, DocumentExtractService]
})
export class DocumentModule { }