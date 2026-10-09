import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

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
    // Prisma exception messages may include a failing row's source text or credentials.
    this.safeLogger.error(
      'Unhandled server exception; request returned HTTP 500',
    );
    super.catch(
      new InternalServerErrorException({
        message: 'Internal server error',
        statusCode: 500,
      }),
      host,
    );
  }
}
