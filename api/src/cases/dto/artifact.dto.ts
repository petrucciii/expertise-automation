import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class GenerateArtifactDto {
  @IsOptional()
  @IsBoolean()
  enhanced?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetSection?: string;
}

export class SaveArtifactRevisionDto {
  @IsObject()
  content: Record<string, unknown>;
}
