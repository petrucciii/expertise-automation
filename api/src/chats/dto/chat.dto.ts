import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateChatDto {
  @IsUUID()
  caseId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12000)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  documentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetSection?: string;
}

export class SendChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(12000)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  documentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetSection?: string;
}

export class GetChatsDto {
  @IsOptional()
  @Type(() => String)
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
