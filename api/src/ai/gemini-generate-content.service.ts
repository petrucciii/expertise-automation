import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { Ajv } from 'ajv';

export type StructuredResponse = {
  value: unknown;
  model: string;
};

type StructuredGenerationRequest = {
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  images?: Array<{
    mimeType: 'image/png' | 'image/jpeg';
    data: Buffer;
  }>;
};

const MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
] as const;

const GENERATE_CONTENT_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models';

@Injectable()
export class GeminiGenerateContentService {
  private readonly logger = new Logger(GeminiGenerateContentService.name);
  private readonly apiKey = process.env.GEMINI_API_KEY;
  private readonly validator = new Ajv({ strict: false, allErrors: false });

  async createStructuredResponse(
    request: StructuredGenerationRequest,
  ): Promise<StructuredResponse> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'AI features are not configured on this server',
      );
    }
    if (Buffer.byteLength(request.input, 'utf8') > 512_000) {
      throw new BadRequestException(
        'AI context exceeds the supported size. Select a smaller set of sources.',
      );
    }
    const validate = this.validator.compile(request.schema);
    // A single deadline covers the entire cascade, including response-body reads.
    const signal = AbortSignal.timeout(60_000);

    for (const [index, model] of MODEL_CASCADE.entries()) {
      let response: Response;
      try {
        response = await fetch(
          `${GENERATE_CONTENT_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            signal,
            redirect: 'error',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey,
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: request.instructions }],
              },
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: request.input },
                    ...(request.images ?? []).map((image) => ({
                      inlineData: {
                        mimeType: image.mimeType,
                        data: image.data.toString('base64'),
                      },
                    })),
                  ],
                },
              ],
              generationConfig: {
                maxOutputTokens: 8192,
                responseFormat: {
                  text: {
                    mimeType: 'APPLICATION_JSON',
                    schema: request.schema,
                  },
                },
              },
            }),
          },
        );
      } catch (error) {
        this.logger.warn(`Gemini request failed: ${safeErrorName(error)}`);
        throw new ServiceUnavailableException('AI provider request failed');
      }

      if (response.status === 429) {
        await response.body?.cancel().catch(() => undefined);
        const nextModel = MODEL_CASCADE[index + 1];
        if (nextModel) {
          this.logger.warn(
            `Gemini model ${model} is rate limited; trying ${nextModel}`,
          );
          continue;
        }

        this.logger.warn('All configured Gemini models are rate limited');
        throw new ServiceUnavailableException(
          'All configured Gemini models are rate limited',
        );
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        this.logger.warn(
          `Gemini returned HTTP ${response.status} for ${model}`,
        );
        throw new ServiceUnavailableException(
          'AI provider could not complete the request',
        );
      }

      let payload: unknown;
      try {
        payload = await readBoundedJson(response);
      } catch {
        throw new ServiceUnavailableException(
          'AI provider returned an unreadable response',
        );
      }
      const outputText = readOutputText(payload);
      if (!outputText) {
        throw new ServiceUnavailableException(
          'AI provider returned no usable structured response',
        );
      }

      try {
        const value: unknown = JSON.parse(outputText);
        if (!validate(value)) throw new Error('Response schema mismatch');
        return { value, model };
      } catch {
        throw new ServiceUnavailableException(
          'AI provider returned an invalid structured response',
        );
      }
    }

    throw new ServiceUnavailableException(
      'AI provider could not complete the request',
    );
  }
}

function readOutputText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) {
    return null;
  }

  const candidate = payload.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content)) {
    return null;
  }
  if (candidate.finishReason !== 'STOP') return null;

  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) {
    return null;
  }

  const textParts = parts.flatMap((part) =>
    isRecord(part) && part.thought !== true && typeof part.text === 'string'
      ? [part.text]
      : [],
  );
  return textParts.length > 0 ? textParts.join('') : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeErrorName(error: unknown): string {
  return error instanceof Error &&
    ['AbortError', 'TimeoutError', 'TypeError'].includes(error.name)
    ? error.name
    : 'RequestError';
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing response body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2_000_000) throw new Error('Response exceeds size limit');
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
