import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { summarizeNumericColumn } from './tabular-analysis.js';

describe('summarizeNumericColumn', () => {
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
