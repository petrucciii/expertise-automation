import { OptionalField } from '../../common/validation.js';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto.js';

export class GetDocumentDto extends PaginationDto {
  @OptionalField()
  @IsUUID()
  id?: string;

  @OptionalField()
  @IsString()
  @MaxLength(240)
  fileName?: string;
}
