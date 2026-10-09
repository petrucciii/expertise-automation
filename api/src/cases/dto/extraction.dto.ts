import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class AcceptExtractionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  suggestionIds: string[];
}
