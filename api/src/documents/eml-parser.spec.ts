import { describe, expect, it } from 'vitest';
import { parseEmail } from './eml-parser.js';

describe('parseEmail', () => {
  it('preserves message metadata and extracts only readable body parts', () => {
    const raw = [
      'From: surveyor@example.test',
      'To: claims@example.test',
      'Cc: archive@example.test',
      'Date: Thu, 08 Oct 2026 12:30:00 +0200',
      'Message-ID: <message-123@example.test>',
      'Subject: =?UTF-8?Q?Relazione=20peritale?=',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="case-boundary"',
      '',
      '--case-boundary',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Il carico =C3=A8 stato controllato.',
      '--case-boundary',
      'Content-Type: application/pdf',
      'Content-Disposition: attachment; filename="survey.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'YXR0YWNobWVudCBjb250ZW50',
      '--case-boundary--',
      '',
    ].join('\r\n');

    const parsed = parseEmail(raw);

    expect(parsed.metadata).toMatchObject({
      messageId: '<message-123@example.test>',
      sender: 'surveyor@example.test',
      recipients: 'claims@example.test',
      cc: 'archive@example.test',
      subject: 'Relazione peritale',
      attachmentNames: ['survey.pdf'],
    });
    expect(parsed.text).toBe('Il carico è stato controllato.');
    expect(parsed.text).not.toContain('attachment content');
  });

  it('rejects email files without a header and body separator', () => {
    expect(() => parseEmail('not an email file')).toThrow(/headers/i);
  });
});
