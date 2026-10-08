import { IsNotEmpty, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';


export class UploadDocumentDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    ownerId: number;
}
