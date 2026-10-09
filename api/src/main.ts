import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';
import cookieParser from 'cookie-parser';
import { getAllowedWebOrigins } from './auth/auth-origin.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// Load AppModule after dotenv so AuthenticationModule receives the secret.
const { AppModule } = await import('./app.module.js');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // Cookie credentials require an explicit origin allowlist.
  app.enableCors({
    origin: getAllowedWebOrigins(),
    credentials: true,
  });

  app.use(cookieParser());

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Removes properties not defined in the DTO (avoids injecting unwanted fields)
      forbidNonWhitelisted: true,    // Throws an error if the client sends unknown fields
      transform: true,               // Converts types (e.g., URL strings to numbers/real objects)
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
