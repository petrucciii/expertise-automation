import { describe, expect, it } from 'vitest';
import { parseEmail } from './eml-parser.js';

describe('parseEmail', () => {
  it('decodes original Windows-1252 octets without losing accents, quotes or the euro sign', () => {
    const headers = Buffer.from(
      'From: carrier@example.test\r\nSubject: Cargo claim\r\nContent-Type: text/plain; charset=windows-1252\r\n\r\n',
    );
    const body = Buffer.from([
      0x43, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x63, 0x61, 0x72, 0x67, 0x6f, 0x94,
      0x20, 0x80, 0x31, 0x30, 0x30,
    ]);
    expect(parseEmail(Buffer.concat([headers, body])).text).toBe(
      'Café “cargo” €100',
    );
  });

  it('decodes base64 and HTML without executing or retaining script/style content', () => {
    const html =
      '<p>The claimant reports &quot;wet cartons&quot;.</p><script>stealSecrets()</script><style>hidden</style>';
    const raw = `From: claimant@example.test\nContent-Type: text/html; charset=utf-8\nContent-Transfer-Encoding: base64\n\n${Buffer.from(html).toString('base64')}`;
    expect(parseEmail(raw).text).toBe('The claimant reports "wet cartons".');
  });

  it.each(['!!!', 'A'])('rejects malformed base64 %s', (body) => {
    expect(() =>
      parseEmail(
        `From: claims@example.test\nContent-Transfer-Encoding: base64\n\n${body}`,
      ),
    ).toThrow(/encoding/i);
  });

  it('rejects unsupported charsets and invalid original UTF-8 bytes', () => {
    expect(() =>
      parseEmail(
        'From: claims@example.test\nContent-Type: text/plain; charset=unknown-charset\nContent-Transfer-Encoding: base64\n\nYWJj',
      ),
    ).toThrow(/encoding/);
    expect(() =>
      parseEmail(
        Buffer.concat([
          Buffer.from(
            'From: claims@example.test\nContent-Type: text/plain; charset=utf-8\n\n',
          ),
          Buffer.from([0xff]),
        ]),
      ),
    ).toThrow(/encoding/);
  });

  it('treats prototype-like headers as inert metadata', () => {
    const email = parseEmail(
      'From: claims@example.test\nconstructor: attacker\n__proto__: attacker\n\nA source statement',
    );
    expect(Object.getPrototypeOf(email.headers)).toBeNull();
    expect(email.text).toBe('A source statement');
  });

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
