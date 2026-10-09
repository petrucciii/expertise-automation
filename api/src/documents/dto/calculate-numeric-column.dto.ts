import { OptionalField, HasText } from '../../common/validation.js';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const OPERATIONS = ['SUM', 'MIN', 'MAX', 'MEAN', 'COUNT', 'RANGE'];
const DECIMAL_SEPARATORS = ['.', ','];
const THOUSANDS_SEPARATORS = ['.', ',', ' ', '_'];

export class CalculateNumericColumnDto {
  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(160)
  fieldKey: string;

  @IsString()
  @IsNotEmpty()
  @HasText()
  @MaxLength(240)
  columnHeader: string;

  @OptionalField()
  @IsString()
  @MaxLength(120)
  worksheetName?: string;

  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000)
  headerRow?: number;

  @IsIn(OPERATIONS)
  operation: 'SUM' | 'MIN' | 'MAX' | 'MEAN' | 'COUNT' | 'RANGE';

  @OptionalField()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @OptionalField()
  @IsIn(DECIMAL_SEPARATORS)
  decimalSeparator?: '.' | ',';

  @OptionalField()
  @IsIn(THOUSANDS_SEPARATORS)
  thousandsSeparator?: '.' | ',' | ' ' | '_';

  @OptionalField()
  @IsString()
  @MaxLength(160)
  comparisonGroup?: string;
}
