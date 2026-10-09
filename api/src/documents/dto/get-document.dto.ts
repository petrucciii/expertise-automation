import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GetDocumentDto {
    @IsOptional()
    @IsUUID()
    id?: string;

    @IsOptional()
    @IsString()
    fileName?: string;
}
