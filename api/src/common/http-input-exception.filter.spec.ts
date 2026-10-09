import {
  BadRequestException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { HttpInputExceptionFilter } from './http-input-exception.filter.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpServer } from '@nestjs/common';

describe('safe HTTP exception logging', () => {
  const reply = vi.fn();
  const adapter = {
    isHeadersSent: () => false,
    reply,
  } as unknown as HttpServer;
  const host = { getArgByIndex: () => ({}) } as unknown as ArgumentsHost;
  beforeEach(() => vi.restoreAllMocks());

  it('returns a generic 500 and never logs a failing database row or secret', () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    new HttpInputExceptionFilter(adapter).catch(
      new Error('DATABASE_URL=private and confidential source excerpt'),
      host,
    );
    expect(reply).toHaveBeenLastCalledWith(
      {},
      { message: 'Internal server error', statusCode: 500 },
      500,
    );
    expect(log).toHaveBeenCalledWith(
      'Unhandled server exception; request returned HTTP 500',
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private|confidential|DATABASE_URL/,
    );
  });
  it('preserves expected validation errors without logging them', () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    new HttpInputExceptionFilter(adapter).catch(
      new BadRequestException('Unknown source reference'),
      host,
    );
    expect(reply).toHaveBeenLastCalledWith(
      {},
      {
        message: 'Unknown source reference',
        error: 'Bad Request',
        statusCode: 400,
      },
      400,
    );
    expect(log).not.toHaveBeenCalled();
  });
});
