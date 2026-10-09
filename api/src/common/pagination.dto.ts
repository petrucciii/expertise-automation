import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { OptionalField } from './validation.js';

export class PaginationDto {
  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  offset = 0;
}
