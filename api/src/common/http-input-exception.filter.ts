import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client.js';

/** Normalize input errors and keep database records/secrets out of unexpected-error logs. */
@Catch()
export class HttpInputExceptionFilter extends BaseExceptionFilter {
  private readonly safeLogger = new Logger(HttpInputExceptionFilter.name);
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'type' in exception &&
      'status' in exception
    ) {
      if (exception.type === 'entity.too.large' && exception.status === 413) {
        super.catch(
          new PayloadTooLargeException(
            'Request body exceeds the supported size',
          ),
          host,
        );
        return;
      }
    }
    if (exception instanceof HttpException) {
      super.catch(exception, host);
      return;
    }
    // Log only fixed categories and Prisma codes: raw messages can expose a row or credentials.
    const code =
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      /^P\d{4}$/.test(exception.code)
        ? exception.code
        : null;
    const category =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? 'DatabaseRequestError'
        : exception instanceof TypeError
          ? 'TypeError'
          : exception instanceof RangeError
            ? 'RangeError'
            : 'UnexpectedError';
    this.safeLogger.error(
      `Unhandled server exception: ${category}${code ? `; code=${code}` : ''}`,
    );
    if (code === 'P2021' || code === 'P2022') {
      // An old schema is an operational readiness failure, not a failed AI generation.
      super.catch(
        new ServiceUnavailableException({
          code: 'DATABASE_SCHEMA_OUTDATED',
          message:
            'Database migrations must be applied before using the application',
          statusCode: 503,
        }),
        host,
      );
      return;
    }
    super.catch(
      new InternalServerErrorException({
        message: 'Internal server error',
        statusCode: 500,
      }),
      host,
    );
  }
}
