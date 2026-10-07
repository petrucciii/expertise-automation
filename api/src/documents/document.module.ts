
import { Module, Global } from "@nestjs/common";
import { DocumentService } from "./document.service.js";
import { DocumentController } from "./document.controller.js";

@Global()
@Module({
    providers: [DocumentService],
    controllers: [DocumentController],
    exports: [DocumentService]
})
export class DocumentModule { }