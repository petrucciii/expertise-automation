import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiGenerateContentService } from './gemini-generate-content.service.js';

const originalKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = originalKey;
  }
  vi.unstubAllGlobals();
});

describe('GeminiGenerateContentService', () => {
  const request = {
    instructions: 'Use only the supplied cargo evidence.',
    input: 'The consignee reports five wet cartons.',
    schema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    },
  };

  it.each([400, 403, 404, 500, 503])(
    'does not continue the cascade after HTTP %s',
    async (status) => {
      process.env.GEMINI_API_KEY = 'test-key';
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('Provider details must remain private', { status }),
        );
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        new GeminiGenerateContentService().createStructuredResponse(request),
      ).rejects.toMatchObject({ status: 503 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    null,
    [],
    {},
    { candidates: [] },
    {
      candidates: [
        {
          finishReason: 'MAX_TOKENS',
          content: { parts: [{ text: '{"answer":"partial"}' }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: 'SAFETY',
          content: { parts: [{ text: '{"answer":"blocked"}' }] },
        },
      ],
    },
    {
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } },
      ],
    },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: '{"answer":5}' }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: '{"answer":"ok","invented":true}' }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [{ text: '{"answer":"private reasoning"}', thought: true }],
          },
        },
      ],
    },
  ])(
    'rejects incomplete, blocked or schema-invalid provider payload %#',
    async (payload) => {
      process.env.GEMINI_API_KEY = 'test-key';
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(payload)));
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        new GeminiGenerateContentService().createStructuredResponse(request),
      ).rejects.toMatchObject({ status: 503 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('joins output fragments and ignores thought parts', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    { text: 'private reasoning', thought: true },
                    { text: '{"answer":' },
                    { text: '"supported"}' },
                  ],
                },
              },
            ],
          }),
        ),
      ),
    );
    expect(
      await new GeminiGenerateContentService().createStructuredResponse(
        request,
      ),
    ).toMatchObject({ value: { answer: 'supported' } });
  });

  it.each(['invalid json', 'x'.repeat(2_000_001)])(
    'bounds and validates the provider response body %#',
    async (body) => {
      process.env.GEMINI_API_KEY = 'test-key';
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
      );
      await expect(
        new GeminiGenerateContentService().createStructuredResponse(request),
      ).rejects.toMatchObject({ status: 503 });
    },
  );

  it('refuses oversized UTF-8 input before making a provider request', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new GeminiGenerateContentService().createStructuredResponse({
        ...request,
        input: 'é'.repeat(256_001),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    new TypeError('network failed'),
    new DOMException('deadline exceeded', 'TimeoutError'),
  ])('stops on transport failures and timeouts %#', async (error) => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new GeminiGenerateContentService().createStructuredResponse(request),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses Gemini structured JSON output without exposing the key in the URL', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"answer":"ok"}' }] },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new GeminiGenerateContentService();

    const result = await service.createStructuredResponse({
      instructions: 'Keep the answer short.',
      input: 'Return a valid response.',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      },
      images: [{ mimeType: 'image/jpeg', data: Buffer.from('image-bytes') }],
    });

    expect(result).toEqual({
      value: { answer: 'ok' },
      model: 'gemini-3.8-flash',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    );
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const body = init?.body;
    if (typeof body !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    const request = JSON.parse(body) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{
        role: string;
        parts: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      }>;
      generationConfig: {
        responseFormat: { text: { mimeType: string; schema: unknown } };
      };
    };
    expect(request.systemInstruction.parts[0]?.text).toBe(
      'Keep the answer short.',
    );
    expect(request.contents[0]?.parts[0]?.text).toBe(
      'Return a valid response.',
    );
    expect(request.contents[0]?.parts[1]?.inlineData).toEqual({
      mimeType: 'image/jpeg',
      data: Buffer.from('image-bytes').toString('base64'),
    });
    expect(request.generationConfig.responseFormat.text.mimeType).toBe(
      'APPLICATION_JSON',
    );
  });

  it('falls back through the configured model order only after HTTP 429', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: '{"answer":"fallback"}' }] },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const service = new GeminiGenerateContentService();

    const result = await service.createStructuredResponse({
      instructions: 'Instructions.',
      input: 'Input.',
      schema: { type: 'object' },
    });

    expect(result.model).toBe('gemini-3.5-flash');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    ]);
  });

  it('does not switch models for authentication or other non-rate-limit errors', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new GeminiGenerateContentService();

    await expect(
      service.createStructuredResponse({
        instructions: 'Instructions.',
        input: 'Input.',
        schema: { type: 'object' },
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns service unavailable after every model is rate limited', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new GeminiGenerateContentService();

    await expect(
      service.createStructuredResponse({
        instructions: 'Instructions.',
        input: 'Input.',
        schema: { type: 'object' },
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not call an external API when the server has no API key', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const service = new GeminiGenerateContentService();

    await expect(
      service.createStructuredResponse({
        instructions: 'Instructions.',
        input: 'Input.',
        schema: { type: 'object' },
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
