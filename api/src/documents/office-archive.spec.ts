import { describe, expect, it } from 'vitest';
import { crc32, deflateRawSync } from 'node:zlib';
import {
  cargoDocx,
  temperatureWorkbook,
} from '../../test/fixtures/cargo-documents.js';
import { validateOfficeArchive } from './office-archive.js';

describe('Office archive validation', () => {
  it('accepts real DOCX and XLSX cargo fixtures', async () => {
    const awaitedDocx = await cargoDocx([
      'Road survey',
      'Five wet cartons were reported.',
    ]);
    expect(() =>
      validateOfficeArchive(awaitedDocx, ['word/document.xml']),
    ).not.toThrow();
    validateOfficeArchive(await temperatureWorkbook(), ['xl/workbook.xml']);
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from('PK fake ZIP'),
    archive([]),
    archive([['word/document.xml', '<document/>']]),
  ])('rejects incomplete ZIP structures %#', (file) => {
    expect(() => validateOfficeArchive(file, ['word/document.xml'])).toThrow(
      /archive/i,
    );
  });

  it.each([
    '../escape.xml',
    '/absolute.xml',
    'C:/escape.xml',
    'word\\escape.xml',
    'word/../../escape.xml',
  ])('rejects unsafe entry name %s', (name) => {
    const file = archive([
      ['[Content_Types].xml', '<Types/>'],
      ['word/document.xml', '<document/>'],
      [name, 'x'],
    ]);
    expect(() => validateOfficeArchive(file, ['word/document.xml'])).toThrow(
      /archive/i,
    );
  });

  it('rejects duplicate entries rather than letting parsers disagree about the source', () => {
    const file = archive([
      ['[Content_Types].xml', '<Types/>'],
      ['word/document.xml', 'first'],
      ['word/document.xml', 'second'],
    ]);
    expect(() => validateOfficeArchive(file, ['word/document.xml'])).toThrow(
      /archive/i,
    );
  });

  it.each([
    (file: Buffer, central: number) => file.writeUInt32LE(0, central + 16),
    (file: Buffer, central: number) => file.writeUInt32LE(1, central + 24),
    (file: Buffer, central: number) => file.writeUInt16LE(1, central + 8),
    (file: Buffer, central: number) => file.writeUInt16LE(99, central + 10),
    (file: Buffer, central: number) =>
      file.writeUInt32LE(0xfffffff0, central + 42),
    (file: Buffer) => file.writeUInt32LE(0, 0),
  ])('rejects altered local or central directory records %#', (alter) => {
    const file = archive([
      ['[Content_Types].xml', '<Types/>'],
      ['word/document.xml', '<document/>'],
    ]);
    const central = file.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    alter(file, central);
    expect(() => validateOfficeArchive(file, ['word/document.xml'])).toThrow(
      /archive/i,
    );
  });

  it('checks actual inflation output even when ZIP metadata understates it', () => {
    const file = archive([
      ['[Content_Types].xml', '<Types/>'],
      ['word/document.xml', 'x'.repeat(20 * 1024 * 1024 + 1)],
    ]);
    const first = file.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const second = file.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      first + 4,
    );
    file.writeUInt32LE(1, second + 24);
    expect(() => validateOfficeArchive(file, ['word/document.xml'])).toThrow(
      /archive/i,
    );
  });
});

/** Build an independent ZIP fixture so tests can forge metadata without involving an Office parser. */
function archive(entries: Array<[string, string]>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let localOffset = 0;
  for (const [name, text] of entries) {
    const bytes = Buffer.from(text);
    const compressed = deflateRawSync(bytes);
    const encodedName = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(encodedName.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc32(bytes), 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(encodedName.length, 28);
    directory.writeUInt32LE(localOffset, 42);
    local.push(header, encodedName, compressed);
    central.push(directory, encodedName);
    localOffset += header.length + encodedName.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...local, directory, end]);
}
