import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

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

  async createStructuredResponse(
    request: StructuredGenerationRequest,
  ): Promise<StructuredResponse> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'AI features are not configured on this server',
      );
    }

    for (const [index, model] of MODEL_CASCADE.entries()) {
      let response: Response;
      try {
        response = await fetch(
          `${GENERATE_CONTENT_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            signal: AbortSignal.timeout(60_000),
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
        this.logger.warn(
          `Gemini returned HTTP ${response.status} for ${model}`,
        );
        throw new ServiceUnavailableException(
          'AI provider could not complete the request',
        );
      }

      const payload: unknown = await response.json().catch(() => null);
      const outputText = readOutputText(payload);
      if (!outputText) {
        throw new ServiceUnavailableException(
          'AI provider returned no usable structured response',
        );
      }

      try {
        return { value: JSON.parse(outputText) as unknown, model };
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

  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) {
    return null;
  }

  const textParts = parts.flatMap((part) =>
    isRecord(part) && typeof part.text === 'string' ? [part.text] : [],
  );
  return textParts.length > 0 ? textParts.join('') : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
