import { IsOptional, IsString } from "class-validator";

export class GetDocumentDto {
    @IsOptional()
    @IsString()
    id?: string;

    @IsOptional()
    @IsString()
    fileName?: string;
}