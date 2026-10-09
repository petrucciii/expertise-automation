import { ArgumentsHost, Catch, PayloadTooLargeException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/** Treat oversized input as an expected client error instead of logging it as a server failure. */
@Catch()
export class HttpInputExceptionFilter extends BaseExceptionFilter {
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
    super.catch(exception, host);
  }
}
