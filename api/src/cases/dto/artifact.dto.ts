import { OptionalField } from '../../common/validation.js';
import { IsBoolean, IsObject, IsString, MaxLength } from 'class-validator';

export class GenerateArtifactDto {
  @OptionalField()
  @IsBoolean()
  enhanced?: boolean;

  @OptionalField()
  @IsString()
  @MaxLength(120)
  targetSection?: string;
}

export class SaveArtifactRevisionDto {
  @IsObject()
  content: Record<string, unknown>;
}
