import { BadRequestException } from '@nestjs/common';
import { crc32, inflateRawSync } from 'node:zlib';

const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

/** Validate actual decompressed bytes before an Office parser can allocate from untrusted ZIP metadata. */
export function validateOfficeArchive(
  file: Buffer,
  requiredFiles: string[],
): void {
  let end = -1;
  for (
    let offset = file.length - 22;
    offset >= Math.max(0, file.length - 65_557);
    offset -= 1
  ) {
    if (
      file.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + file.readUInt16LE(offset + 20) === file.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw invalidArchive();
  const count = file.readUInt16LE(end + 10);
  const directorySize = file.readUInt32LE(end + 12);
  const directoryStart = file.readUInt32LE(end + 16);
  if (
    file.readUInt16LE(end + 4) !== 0 ||
    file.readUInt16LE(end + 6) !== 0 ||
    file.readUInt16LE(end + 8) !== count ||
    count === 0 ||
    count > 2000 ||
    directoryStart + directorySize !== end
  ) {
    throw invalidArchive();
  }
  let offset = directoryStart;
  let expandedBytes = 0;
  const names = new Set<string>();
  for (let entry = 0; entry < count; entry += 1) {
    if (offset + 46 > end || file.readUInt32LE(offset) !== 0x02014b50)
      throw invalidArchive();
    const flags = file.readUInt16LE(offset + 8);
    const method = file.readUInt16LE(offset + 10);
    const checksum = file.readUInt32LE(offset + 16);
    const compressedSize = file.readUInt32LE(offset + 20);
    const size = file.readUInt32LE(offset + 24);
    const nameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const localOffset = file.readUInt32LE(offset + 42);
    const nameEnd = offset + 46 + nameLength;
    if (
      nameEnd + extraLength + commentLength > end ||
      flags & 0x0001 ||
      ![0, 8].includes(method) ||
      size > MAX_ENTRY_BYTES ||
      expandedBytes + size > MAX_ARCHIVE_BYTES ||
      localOffset + 30 > directoryStart
    )
      throw invalidArchive();
    const name = file.subarray(offset + 46, nameEnd).toString('utf8');
    if (
      !name ||
      name.startsWith('/') ||
      /^[a-z]:/i.test(name) ||
      name.includes('\\') ||
      name.includes('\u0000') ||
      name.split('/').includes('..') ||
      names.has(name)
    )
      throw invalidArchive();
    names.add(name);
    if (
      file.readUInt32LE(localOffset) !== 0x04034b50 ||
      file.readUInt16LE(localOffset + 6) !== flags ||
      file.readUInt16LE(localOffset + 8) !== method
    )
      throw invalidArchive();
    const localNameLength = file.readUInt16LE(localOffset + 26);
    const localExtraLength = file.readUInt16LE(localOffset + 28);
    const localNameEnd = localOffset + 30 + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    if (
      dataStart + compressedSize > directoryStart ||
      !file
        .subarray(localOffset + 30, localNameEnd)
        .equals(file.subarray(offset + 46, nameEnd))
    )
      throw invalidArchive();
    const compressed = file.subarray(dataStart, dataStart + compressedSize);
    let expanded: Buffer;
    try {
      expanded =
        method === 0
          ? compressed
          : inflateRawSync(compressed, {
              maxOutputLength: Math.max(
                1,
                Math.min(MAX_ENTRY_BYTES, MAX_ARCHIVE_BYTES - expandedBytes),
              ),
            });
    } catch {
      throw invalidArchive();
    }
    if (expanded.length !== size || crc32(expanded) !== checksum)
      throw invalidArchive();
    expandedBytes += expanded.length;
    offset = nameEnd + extraLength + commentLength;
  }
  if (
    offset !== end ||
    !['[Content_Types].xml', ...requiredFiles].every((name) => names.has(name))
  )
    throw invalidArchive();
}

function invalidArchive(): BadRequestException {
  return new BadRequestException(
    'Office document archive is invalid or exceeds supported limits',
  );
}
