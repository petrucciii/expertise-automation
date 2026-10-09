import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {
  getAllowedWebOrigins,
  validateCookieConfiguration,
} from './auth/auth-origin.js';
import { JsonDepthPipe } from './common/json-depth.pipe.js';
import { HttpInputExceptionFilter } from './common/http-input-exception.filter.js';

/** Apply the same HTTP protections in production and in route integration tests. */
export function configureApp(app: INestApplication): void {
  validateCookieConfiguration();
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: getAllowedWebOrigins(), credentials: true });
  app.use(cookieParser());
  app.useGlobalFilters(new HttpInputExceptionFilter(app.getHttpAdapter()));
  app.useGlobalPipes(
    new JsonDepthPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
}
