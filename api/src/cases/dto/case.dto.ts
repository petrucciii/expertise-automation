import { OptionalField, HasText } from '../../common/validation.js';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
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
import {
  REPORT_TEMPLATE_ID,
  REPORT_TEMPLATE_VERSION,
} from '../report-template.js';

export class AssignmentDto {
  @OptionalField()
  @IsString()
  @MaxLength(254)
  client?: string;

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(2000, { each: true })
  requestedScope?: string[];

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(2000, { each: true })
  limitations?: string[];
}

export class CreateCaseDto {
  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(200)
  title: string;

  @OptionalField()
  @IsString()
  @MaxLength(120)
  internalReference?: string;

  @OptionalField()
  @IsString()
  @MaxLength(160)
  publicReference?: string;

  @OptionalField()
  @IsEnum(CaseFamily)
  caseFamily?: CaseFamily;

  @OptionalField()
  @IsObject()
  @ValidateNested()
  @Type(() => AssignmentDto)
  assignment?: AssignmentDto;

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(2000, { each: true })
  openQuestions?: string[];
}

export class UpdateCaseDto {
  @OptionalField()
  @IsString()
  @IsNotEmpty()
  @HasText()
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

  @OptionalField()
  @IsEnum(CaseFamily)
  caseFamily?: CaseFamily;

  @OptionalField()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @OptionalField()
  @IsObject()
  @ValidateNested()
  @Type(() => AssignmentDto)
  assignment?: AssignmentDto;

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(2000, { each: true })
  openQuestions?: string[];

  @OptionalField()
  @IsString()
  @MaxLength(120)
  @IsIn([REPORT_TEMPLATE_ID])
  reportTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @IsIn([REPORT_TEMPLATE_VERSION])
  clicheSetVersion?: string | null;
}

export class AttachCaseDocumentDto {
  @OptionalField()
  @IsUUID()
  documentId?: string;

  @OptionalField()
  @IsString()
  @MaxLength(240)
  displayName?: string;

  @OptionalField()
  @IsString()
  @MaxLength(80)
  documentType?: string;

  @OptionalField()
  @IsString()
  @MaxLength(1200)
  verificationPurpose?: string;

  @OptionalField()
  @IsString()
  @MaxLength(30000)
  excerptText?: string;

  @OptionalField()
  @IsDateString({ strict: true })
  documentDate?: string;

  @OptionalField()
  @IsString()
  @MaxLength(240)
  senderOrAuthor?: string;

  @OptionalField()
  @IsEnum(DocumentAvailability)
  availability?: DocumentAvailability;

  @OptionalField()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class EvidenceReferenceDto {
  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(40)
  sourceCode: string;

  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  pageNumber?: number;

  @OptionalField()
  @IsString()
  @MaxLength(3000)
  excerpt?: string;
}

export class CreateCaseEventDto {
  @OptionalField()
  @IsString()
  @MaxLength(240)
  attribution?: string;

  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(4000)
  event: string;

  @OptionalField()
  @IsDateString({ strict: true })
  date?: string;

  @OptionalField()
  @IsEnum(EventDateType)
  dateType?: EventDateType;

  @IsEnum(EvidenceStatus)
  epistemicStatus: EvidenceStatus;

  @OptionalField()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(20)
  @Type(() => EvidenceReferenceDto)
  sources?: EvidenceReferenceDto[];
}

export class CreateCaseEvidenceDto {
  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(160)
  fieldKey: string;

  @IsDefined()
  value: unknown;

  @OptionalField()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @OptionalField()
  @IsString()
  @MaxLength(160)
  comparisonGroup?: string;

  @IsEnum(EvidenceStatus)
  epistemicStatus: EvidenceStatus;

  @OptionalField()
  @IsString()
  @MaxLength(240)
  attribution?: string;

  @OptionalField()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(20)
  @Type(() => EvidenceReferenceDto)
  sources?: EvidenceReferenceDto[];
}

export class CreateCaseIssueDto {
  @OptionalField()
  @IsString()
  @MaxLength(120)
  ruleId?: string;

  @OptionalField()
  @IsString()
  @MaxLength(80)
  ruleVersion?: string;

  @IsEnum(ChecklistStatus)
  status: ChecklistStatus;

  @OptionalField()
  @IsString()
  @MaxLength(40)
  severity?: string;

  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(240)
  title: string;

  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(8000)
  explanation: string;

  @OptionalField()
  @IsString()
  @MaxLength(4000)
  suggestedCheck?: string;

  @OptionalField()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(100)
  evidenceIds?: string[];
}

export class UpdateCaseIssueDto {
  @OptionalField()
  @IsEnum(ChecklistStatus)
  status?: ChecklistStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string | null;

  @OptionalField()
  @IsString()
  @MaxLength(240)
  @HasText()
  title?: string;

  @OptionalField()
  @IsString()
  @MaxLength(8000)
  @HasText()
  explanation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  suggestedCheck?: string | null;

  @OptionalField()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(100)
  evidenceIds?: string[];
}
