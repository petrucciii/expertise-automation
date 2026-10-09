import { BadRequestException } from '@nestjs/common';

const MAX_EMAIL_CHARACTERS = 10 * 1024 * 1024;

export type ParsedEmail = {
  headers: Record<string, string>;
  text: string;
  metadata: Record<string, unknown>;
};

export function parseEmail(raw: string): ParsedEmail {
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
  const text = extractTextBody(headers, body);
  const metadata = emailMetadata(headers, raw);
  return { headers, text, metadata };
}

export function parseEmailMetadata(raw: string): Record<string, unknown> {
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

  const result: Record<string, string> = {};
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
): string {
  const contentType = headers['content-type'] ?? 'text/plain';
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundary) {
    return decodeBody(
      body,
      headers['content-transfer-encoding'] ?? '',
      contentType,
    );
  }

  const boundaryMarker = `--${boundary[1] ?? boundary[2]}`;
  const plainTextParts: string[] = [];
  const htmlTextParts: string[] = [];
  const sections = body.split(boundaryMarker);
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
    const isPlain = partType.toLowerCase().startsWith('text/plain');
    const isHtml = partType.toLowerCase().startsWith('text/html');
    if (!isPlain && !isHtml) {
      continue;
    }
    const decoded = decodeBody(
      normalized.slice(separator + 2),
      partHeaders['content-transfer-encoding'] ?? '',
      partType,
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
): string {
  let decoded = body;
  const encoding = transferEncoding.toLowerCase();
  if (encoding === 'base64') {
    try {
      decoded = Buffer.from(body.replace(/\s/g, ''), 'base64').toString(
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
    decoded = Buffer.from(binary, 'binary').toString(charsetFor(contentType));
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

function charsetFor(contentType: string): BufferEncoding {
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i
    .exec(contentType)?.[1]
    ?.toLowerCase();
  if (
    charset === 'iso-8859-1' ||
    charset === 'latin1' ||
    charset === 'windows-1252'
  ) {
    return 'latin1';
  }
  return 'utf8';
}

function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
    (_match, charset: string, mode: string, data: string) => {
      const encoding: BufferEncoding =
        /^(iso-8859-1|latin1|windows-1252)$/i.test(charset) ? 'latin1' : 'utf8';
      if (mode.toLowerCase() === 'b') {
        return Buffer.from(data, 'base64').toString(encoding);
      }
      return Buffer.from(
        data
          .replace(/_/g, ' ')
          .replace(/=([0-9a-f]{2})/gi, (_part, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
          ),
        'binary',
      ).toString(encoding);
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
