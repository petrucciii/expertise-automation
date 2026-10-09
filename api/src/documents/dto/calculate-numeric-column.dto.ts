import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const OPERATIONS = ['SUM', 'MIN', 'MAX', 'MEAN', 'COUNT', 'RANGE'];
const DECIMAL_SEPARATORS = ['.', ','];
const THOUSANDS_SEPARATORS = ['.', ',', ' ', '_'];

export class CalculateNumericColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fieldKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  columnHeader: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  worksheetName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  headerRow?: number;

  @IsIn(OPERATIONS)
  operation: 'SUM' | 'MIN' | 'MAX' | 'MEAN' | 'COUNT' | 'RANGE';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsIn(DECIMAL_SEPARATORS)
  decimalSeparator?: '.' | ',';

  @IsOptional()
  @IsIn(THOUSANDS_SEPARATORS)
  thousandsSeparator?: '.' | ',' | ' ' | '_';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  comparisonGroup?: string;
}
