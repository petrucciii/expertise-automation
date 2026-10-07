import { IsNotEmpty, IsString, IsInt, Type } from 'class-validator';

export class UploadDocumentDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    ownerId: number;

    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    @IsNotEmpty()
    mimeType: string;

    @IsString()
    @IsNotEmpty()
    path: string;

    @IsString()
    @IsNotEmpty()
    hash: string;
}
