import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { summarizeNumericColumn } from './tabular-analysis.js';

describe('summarizeNumericColumn', () => {
  function column(values: ExcelJS.CellValue[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cargo measurements');
    sheet.addRow(['Value', 'Row']);
    values.forEach((value, index) => sheet.addRow([value, index + 1]));
    return workbook;
  }
  const options = {
    columnHeader: 'Value',
    headerRow: 1,
    operation: 'SUM' as const,
  };

  it('retains small terms when large positive and negative measurements cancel', () => {
    expect(
      summarizeNumericColumn(column([1e16, 1, -1e16]), options).result,
    ).toBe(1);
  });

  it('preserves an exactly representable result instead of rounding to fifteen digits', () => {
    expect(
      summarizeNumericColumn(column([1234567890123456]), options).result,
    ).toBe(1234567890123456);
  });

  it('excludes cached shared formulas, dates, booleans, errors and blanks', () => {
    const workbook = column([
      2,
      { formula: 'A2*2', result: 4 },
      { sharedFormula: 'A3', result: 99 },
      new Date(),
      true,
      { error: '#DIV/0!' },
      '  ',
      Number.NaN,
    ]);
    expect(summarizeNumericColumn(workbook, options)).toMatchObject({
      result: 2,
      includedCount: 1,
      formulaCellsExcluded: 2,
      nonNumericCellCount: 4,
      blankCellCount: 1,
    });
  });

  it.each(['1.2,3', '1,23.4', '1,,234.5', 'EUR 1,234.50', '1.234.5'])(
    'excludes malformed numeric string %s',
    (value) => {
      expect(
        summarizeNumericColumn(column([3, value]), {
          ...options,
          thousandsSeparator: ',',
        }),
      ).toMatchObject({ result: 3, nonNumericCellCount: 1 });
    },
  );

  it('supports declared nonbreaking-space grouping and exponent notation', () => {
    expect(
      summarizeNumericColumn(column(['1\u00a0234,5', '-2,5e2']), {
        ...options,
        decimalSeparator: ',',
        thousandsSeparator: ' ',
      }).result,
    ).toBe(984.5);
  });

  it('refuses a nonfinite calculation', () => {
    expect(() =>
      summarizeNumericColumn(
        column([Number.MAX_VALUE, Number.MAX_VALUE]),
        options,
      ),
    ).toThrow(/not finite/);
  });

  it('requires explicit sheet selection and an unambiguous header', () => {
    const workbook = column([2]);
    workbook.addWorksheet('Second load');
    expect(() => summarizeNumericColumn(workbook, options)).toThrow(
      /Select a worksheet/,
    );
    expect(() =>
      summarizeNumericColumn(workbook, {
        ...options,
        worksheetName: 'Unknown',
      }),
    ).toThrow(/worksheet was not found/);
    const sheet = workbook.getWorksheet('Cargo measurements')!;
    sheet.getCell('B1').value = 'Value';
    expect(() =>
      summarizeNumericColumn(workbook, {
        ...options,
        worksheetName: sheet.name,
      }),
    ).toThrow(/ambiguous/);
    expect(() =>
      summarizeNumericColumn(column([2]), { ...options, headerRow: 0 }),
    ).toThrow(/header row/);
  });

  it('refuses rows beyond the documented processing boundary', () => {
    const workbook = column([2]);
    workbook.worksheets[0].getCell('A20001').value = 3;
    expect(() => summarizeNumericColumn(workbook, options)).toThrow(
      /row limit/,
    );
  });

  it('calculates numeric values and records formula and invalid cell exclusions', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Temperature');
    sheet.addRow(['Timestamp', 'Temperature C']);
    sheet.addRow(['2026-01-01T00:00:00Z', 2.5]);
    sheet.addRow(['2026-01-01T01:00:00Z', 3.5]);
    sheet.addRow([
      '2026-01-01T02:00:00Z',
      { formula: 'SUM(B2:B3)', result: 6 },
    ]);
    sheet.addRow(['2026-01-01T03:00:00Z', 'unreadable']);
    sheet.addRow(['2026-01-01T04:00:00Z', null]);

    const result = summarizeNumericColumn(workbook, {
      worksheetName: 'Temperature',
      columnHeader: 'Temperature C',
      headerRow: 1,
      operation: 'MEAN',
    });

    expect(result).toMatchObject({
      result: 3,
      includedCount: 2,
      formulaCellsExcluded: 1,
      nonNumericCellCount: 1,
      blankCellCount: 1,
      firstDataRow: 2,
      lastDataRow: 3,
      formula: 'sum(valid numeric cells) / included count',
    });
  });

  it('parses locale-formatted decimal strings only when separators are explicit', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('CSV');
    sheet.addRow(['Temperature']);
    sheet.addRow(['1.234,5']);
    sheet.addRow(['2.000,5']);

    const result = summarizeNumericColumn(workbook, {
      columnHeader: 'Temperature',
      headerRow: 1,
      operation: 'MEAN',
      decimalSeparator: ',',
      thousandsSeparator: '.',
    });

    expect(result.result).toBe(1617.5);
    expect(result.includedCount).toBe(2);
  });

  it('does not treat malformed thousands grouping as a number', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('CSV');
    sheet.addRow(['Value']);
    sheet.addRow(['2,3']);

    expect(() =>
      summarizeNumericColumn(workbook, {
        columnHeader: 'Value',
        headerRow: 1,
        operation: 'SUM',
        decimalSeparator: '.',
        thousandsSeparator: ',',
      }),
    ).toThrow('Spreadsheet column contains no usable numeric values');
  });
});
