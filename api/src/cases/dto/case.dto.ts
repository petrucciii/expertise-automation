import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CaseFamily,
  CaseStatus,
  ChecklistStatus,
  DocumentAvailability,
  EvidenceStatus,
  EventDateType,
} from '../../generated/prisma/client.js';

export class AssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(254)
  client?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestedScope?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  limitations?: string[];
}

export class CreateCaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  internalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  publicReference?: string;

  @IsOptional()
  @IsEnum(CaseFamily)
  caseFamily?: CaseFamily;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AssignmentDto)
  assignment?: AssignmentDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  openQuestions?: string[];
}

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  internalReference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  publicReference?: string | null;

  @IsOptional()
  @IsEnum(CaseFamily)
  caseFamily?: CaseFamily;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AssignmentDto)
  assignment?: AssignmentDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  openQuestions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reportTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clicheSetVersion?: string | null;
}

export class AttachCaseDocumentDto {
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  verificationPurpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  excerptText?: string;

  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  senderOrAuthor?: string;

  @IsOptional()
  @IsEnum(DocumentAvailability)
  availability?: DocumentAvailability;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class EvidenceReferenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  sourceCode: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  excerpt?: string;
}

export class CreateCaseEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  event: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(EventDateType)
  dateType?: EventDateType;

  @IsEnum(EvidenceStatus)
  epistemicStatus: EvidenceStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceReferenceDto)
  sources?: EvidenceReferenceDto[];
}

export class CreateCaseEvidenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fieldKey: string;

  @IsDefined()
  value: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  comparisonGroup?: string;

  @IsEnum(EvidenceStatus)
  epistemicStatus: EvidenceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  attribution?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceReferenceDto)
  sources?: EvidenceReferenceDto[];
}

export class CreateCaseIssueDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ruleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ruleVersion?: string;

  @IsEnum(ChecklistStatus)
  status: ChecklistStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  explanation: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  suggestedCheck?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  evidenceIds?: string[];
}

export class UpdateCaseIssueDto {
  @IsOptional()
  @IsEnum(ChecklistStatus)
  status?: ChecklistStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  explanation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  suggestedCheck?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  evidenceIds?: string[];
}
