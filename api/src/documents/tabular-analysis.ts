import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export type NumericOperation =
  'SUM' | 'MIN' | 'MAX' | 'MEAN' | 'COUNT' | 'RANGE';

export type NumericColumnOptions = {
  worksheetName?: string;
  columnHeader: string;
  headerRow: number;
  operation: NumericOperation;
  decimalSeparator?: '.' | ',';
  thousandsSeparator?: '.' | ',' | ' ' | '_';
};

export type NumericColumnSummary = {
  worksheetName: string;
  columnHeader: string;
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  includedCount: number;
  blankCellCount: number;
  nonNumericCellCount: number;
  formulaCellsExcluded: number;
  operation: NumericOperation;
  result: number;
  formula: string;
};

export function summarizeNumericColumn(
  workbook: ExcelJS.Workbook,
  options: NumericColumnOptions,
): NumericColumnSummary {
  if (
    options.thousandsSeparator &&
    options.thousandsSeparator === (options.decimalSeparator ?? '.')
  ) {
    throw new BadRequestException(
      'Decimal and thousands separators must be different',
    );
  }
  const worksheet = selectWorksheet(workbook, options.worksheetName);
  if (
    !Number.isSafeInteger(options.headerRow) ||
    options.headerRow < 1 ||
    options.headerRow > worksheet.rowCount
  ) {
    throw new BadRequestException('Spreadsheet header row is invalid');
  }

  const normalizedHeader = options.columnHeader.trim();
  if (!normalizedHeader) {
    throw new BadRequestException('Spreadsheet column header is required');
  }
  const headerRow = worksheet.getRow(options.headerRow);
  const headerColumns: number[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    if (spreadsheetCellText(cell.value).trim() === normalizedHeader) {
      headerColumns.push(columnNumber);
    }
  });
  if (headerColumns.length !== 1) {
    throw new BadRequestException(
      headerColumns.length
        ? 'Spreadsheet column header is ambiguous'
        : 'Spreadsheet column header was not found',
    );
  }
  if (worksheet.rowCount > 20_000) {
    throw new BadRequestException(
      'Spreadsheet exceeds the supported row limit',
    );
  }

  const columnNumber = headerColumns[0];
  const values: number[] = [];
  let firstDataRow: number | null = null;
  let lastDataRow: number | null = null;
  let blankCellCount = 0;
  let nonNumericCellCount = 0;
  let formulaCellsExcluded = 0;

  for (
    let rowNumber = options.headerRow + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const cell = worksheet.getRow(rowNumber).getCell(columnNumber);
    const rawValue = cell.value;
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      blankCellCount += 1;
      continue;
    }
    if (isFormulaCell(cell)) {
      formulaCellsExcluded += 1;
      continue;
    }

    const numericValue = parseNumericCell(rawValue, options);
    if (numericValue === null) {
      nonNumericCellCount += 1;
      continue;
    }
    values.push(numericValue);
    firstDataRow ??= rowNumber;
    lastDataRow = rowNumber;
  }

  if (!values.length || firstDataRow === null || lastDataRow === null) {
    throw new BadRequestException(
      'Spreadsheet column contains no usable numeric values',
    );
  }

  const result = calculate(values, options.operation);
  if (!Number.isFinite(result)) {
    throw new BadRequestException('Spreadsheet calculation is not finite');
  }

  return {
    worksheetName: worksheet.name,
    columnHeader: normalizedHeader,
    headerRow: options.headerRow,
    firstDataRow,
    lastDataRow,
    includedCount: values.length,
    blankCellCount,
    nonNumericCellCount,
    formulaCellsExcluded,
    operation: options.operation,
    result: Number(result.toPrecision(15)),
    formula: operationFormula(options.operation),
  };
}

function selectWorksheet(
  workbook: ExcelJS.Workbook,
  worksheetName?: string,
): ExcelJS.Worksheet {
  if (worksheetName) {
    const worksheet = workbook.getWorksheet(worksheetName);
    if (!worksheet) {
      throw new BadRequestException('Spreadsheet worksheet was not found');
    }
    return worksheet;
  }
  if (workbook.worksheets.length !== 1) {
    throw new BadRequestException(
      'Select a worksheet when the spreadsheet has multiple worksheets',
    );
  }
  return workbook.worksheets[0];
}

function parseNumericCell(
  value: ExcelJS.CellValue,
  options: NumericColumnOptions,
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  let normalized = value.trim().replace(/\u00a0/g, ' ');
  if (!normalized) {
    return null;
  }

  const decimalSeparator = options.decimalSeparator ?? '.';
  const thousandsSeparator = options.thousandsSeparator;
  if (thousandsSeparator && thousandsSeparator === decimalSeparator) {
    throw new BadRequestException(
      'Decimal and thousands separators must be different',
    );
  }
  if (thousandsSeparator) {
    const escapedSeparator = thousandsSeparator.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    const integerPart = normalized.split(decimalSeparator, 1)[0];
    const hasThousandsSeparator = integerPart.includes(thousandsSeparator);
    if (
      hasThousandsSeparator &&
      !new RegExp(`^[+-]?\\d{1,3}(?:${escapedSeparator}\\d{3})+$`).test(
        integerPart,
      )
    ) {
      return null;
    }
    normalized = normalized.split(thousandsSeparator).join('');
  }
  if (decimalSeparator === ',') {
    normalized = normalized.replace(',', '.');
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculate(values: number[], operation: NumericOperation): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = sum + adjusted;
    compensation = next - sum - adjusted;
    sum = next;
  }

  switch (operation) {
    case 'SUM':
      return sum;
    case 'MIN':
      return Math.min(...values);
    case 'MAX':
      return Math.max(...values);
    case 'MEAN':
      return sum / values.length;
    case 'COUNT':
      return values.length;
    case 'RANGE':
      return Math.max(...values) - Math.min(...values);
  }
}

function operationFormula(operation: NumericOperation): string {
  switch (operation) {
    case 'SUM':
      return 'sum(valid numeric cells)';
    case 'MIN':
      return 'min(valid numeric cells)';
    case 'MAX':
      return 'max(valid numeric cells)';
    case 'MEAN':
      return 'sum(valid numeric cells) / included count';
    case 'COUNT':
      return 'count(valid numeric cells)';
    case 'RANGE':
      return 'max(valid numeric cells) - min(valid numeric cells)';
  }
}

function isFormulaCell(cell: ExcelJS.Cell): boolean {
  return (
    cell.type === ExcelJS.ValueType.Formula ||
    (typeof cell.value === 'object' &&
      cell.value !== null &&
      'formula' in cell.value)
  );
}

function spreadsheetCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .filter((part): part is string => typeof part === 'string')
        .join('');
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
    if ('formula' in value && typeof value.formula === 'string') {
      return `=${value.formula}`;
    }
    return '';
  }
  return String(value);
}
