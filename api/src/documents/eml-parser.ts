import { BadRequestException } from '@nestjs/common';

const MAX_EMAIL_CHARACTERS = 10 * 1024 * 1024;

export type ParsedEmail = {
  headers: Record<string, string>;
  text: string;
  metadata: Record<string, unknown>;
};

export function parseEmail(source: string | Buffer): ParsedEmail {
  // Preserve original octets until each MIME part declares its own charset.
  const binarySource = Buffer.isBuffer(source);
  const raw = binarySource ? source.toString('latin1') : source;
  if (!raw || raw.length > MAX_EMAIL_CHARACTERS || raw.includes('\u0000')) {
    throw new BadRequestException('Email file is invalid');
  }

  const normalized = raw.replace(/\r\n/g, '\n');
  const separator = normalized.indexOf('\n\n');
  if (separator < 0) {
    throw new BadRequestException('Email headers are missing');
  }

  const headers = parseHeaders(normalized.slice(0, separator));
  if (!Object.keys(headers).length) {
    throw new BadRequestException('Email headers are invalid');
  }

  const body = normalized.slice(separator + 2);
  const text = extractTextBody(headers, body, 0, binarySource);
  const metadata = emailMetadata(headers, raw);
  return { headers, text, metadata };
}

export function parseEmailMetadata(
  raw: string | Buffer,
): Record<string, unknown> {
  return parseEmail(raw).metadata;
}

function parseHeaders(source: string): Record<string, string> {
  const unfolded: string[] = [];
  for (const line of source.split('\n')) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }

  const result: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const line of unfolded) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!/^[a-z0-9-]+$/.test(name) || name.length > 80 || value.length > 4000) {
      continue;
    }
    result[name] = result[name] ? `${result[name]}, ${value}` : value;
  }
  return result;
}

function emailMetadata(
  headers: Record<string, string>,
  raw: string,
): Record<string, unknown> {
  const attachmentNames = [
    ...raw.matchAll(/filename\*?\s*=\s*(?:UTF-8''|"?)([^;"\r\n]+)/gi),
  ]
    .map((match) => decodeURIComponentSafe(match[1].trim()))
    .filter(Boolean)
    .slice(0, 100);

  return {
    messageId: headers['message-id'] ?? null,
    sender: headers.from ?? headers.sender ?? null,
    recipients: headers.to ?? null,
    cc: headers.cc ?? null,
    date: headers.date ?? null,
    subject: decodeEncodedWords(headers.subject ?? ''),
    attachmentNames,
  };
}

function extractTextBody(
  headers: Record<string, string>,
  body: string,
  depth = 0,
  binarySource = false,
): string {
  if (depth > 10)
    throw new BadRequestException(
      'Email MIME nesting exceeds supported limits',
    );
  const contentType = headers['content-type'] ?? 'text/plain';
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundary) {
    return decodeBody(
      body,
      headers['content-transfer-encoding'] ?? '',
      contentType,
      binarySource,
    );
  }

  const boundaryMarker = `--${boundary[1] ?? boundary[2]}`;
  const plainTextParts: string[] = [];
  const htmlTextParts: string[] = [];
  const sections = body.split(boundaryMarker);
  if (sections.length > 1000)
    throw new BadRequestException('Email contains too many MIME parts');
  for (const section of sections) {
    if (!section.trim() || section.trim() === '--') {
      continue;
    }
    const normalized = section.replace(/^\n+|\n+$/g, '');
    const separator = normalized.indexOf('\n\n');
    if (separator < 0) {
      continue;
    }
    const partHeaders = parseHeaders(normalized.slice(0, separator));
    const partType = partHeaders['content-type'] ?? 'text/plain';
    if (
      partHeaders['content-disposition']?.toLowerCase().includes('attachment')
    ) {
      continue;
    }
    if (partType.toLowerCase().startsWith('multipart/')) {
      const nested = extractTextBody(
        partHeaders,
        normalized.slice(separator + 2),
        depth + 1,
        binarySource,
      );
      if (nested.trim()) plainTextParts.push(nested.trim());
      continue;
    }
    const isPlain = partType.toLowerCase().startsWith('text/plain');
    const isHtml = partType.toLowerCase().startsWith('text/html');
    if (!isPlain && !isHtml) {
      continue;
    }
    const decoded = decodeBody(
      normalized.slice(separator + 2),
      partHeaders['content-transfer-encoding'] ?? '',
      partType,
      binarySource,
    );
    if (decoded.trim()) {
      (isPlain ? plainTextParts : htmlTextParts).push(decoded.trim());
    }
  }
  return (plainTextParts.length ? plainTextParts : htmlTextParts).join('\n\n');
}

function decodeBody(
  body: string,
  transferEncoding: string,
  contentType: string,
  binarySource: boolean,
): string {
  let decoded = body;
  const encoding = transferEncoding.toLowerCase();
  if (encoding === 'base64') {
    try {
      const encoded = body.replace(/\s/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1)
        throw new Error('Invalid base64');
      decoded = decodeBytes(
        Buffer.from(encoded, 'base64'),
        charsetFor(contentType),
      );
    } catch {
      throw new BadRequestException('Email body encoding is invalid');
    }
  } else if (encoding === 'quoted-printable') {
    const binary = body
      .replace(/=\n/g, '')
      .replace(/=([0-9a-f]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    decoded = decodeBytes(
      Buffer.from(binary, 'latin1'),
      charsetFor(contentType),
    );
  } else if (binarySource) {
    decoded = decodeBytes(Buffer.from(body, 'latin1'), charsetFor(contentType));
  }

  if (contentType.toLowerCase().startsWith('text/html')) {
    decoded = decoded
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }
  return decoded
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function charsetFor(contentType: string): string {
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i
    .exec(contentType)?.[1]
    ?.toLowerCase();
  return charset ?? 'utf-8';
}

function decodeBytes(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    throw new BadRequestException('Email charset or body encoding is invalid');
  }
}

function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
    (_match, charset: string, mode: string, data: string) => {
      if (mode.toLowerCase() === 'b') {
        return decodeBytes(Buffer.from(data, 'base64'), charset);
      }
      return decodeBytes(
        Buffer.from(
          data
            .replace(/_/g, ' ')
            .replace(/=([0-9a-f]{2})/gi, (_part, hex: string) =>
              String.fromCharCode(Number.parseInt(hex, 16)),
            ),
          'binary',
        ),
        charset,
      );
    },
  );
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\s+/g, ' '));
  } catch {
    return value;
  }
}
