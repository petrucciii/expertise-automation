import { describe, expect, it } from 'vitest';
import { detectFormat, sanitizeFileName } from './document.service.js';

describe('uploaded document validation', () => {
  it('reduces client filenames to a safe display name', () => {
    expect(sanitizeFileName('..\\..\\private\\survey.pdf')).toBe('survey.pdf');
    expect(sanitizeFileName('claim\nreport.pdf')).toBe('claimreport.pdf');
  });

  it('detects a PDF from file bytes and extension', () => {
    const format = detectFormat(
      {
        originalname: 'survey.pdf',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('%PDF-1.7 test document'),
      },
      'survey.pdf',
    );

    expect(format).toEqual({ extension: '.pdf', mimeType: 'application/pdf' });
  });

  it('rejects a renamed HTML file instead of trusting its extension', () => {
    expect(() =>
      detectFormat(
        {
          originalname: 'survey.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('<html>not a PDF</html>'),
        },
        'survey.pdf',
      ),
    ).toThrow(/supported files/i);
  });
});
