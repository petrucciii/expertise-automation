import { OptionalField } from '../../common/validation.js';
import {
  IsBoolean,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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
  @OptionalField()
  @IsUUID()
  expectedArtifactId?: string;

  @IsObject()
  content: Record<string, unknown>;
}
