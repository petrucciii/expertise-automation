import { OptionalField, HasText } from '../../common/validation.js';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/pagination.dto.js';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateChatDto {
  @IsUUID()
  caseId: string;

  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(12000)
  message: string;

  @OptionalField()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  documentIds?: string[];

  @OptionalField()
  @IsString()
  @MaxLength(120)
  targetSection?: string;
}

export class SendChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(12000)
  message: string;

  @OptionalField()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  documentIds?: string[];

  @OptionalField()
  @IsString()
  @MaxLength(120)
  targetSection?: string;
}

export class GetChatsDto extends PaginationDto {
  @OptionalField()
  @Type(() => String)
  @IsUUID()
  caseId?: string;

  @OptionalField()
  @IsString()
  @MaxLength(120)
  title?: string;
}
