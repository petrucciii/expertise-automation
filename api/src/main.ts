import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });



async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // Enable CORS
  app.enableCors({
    origin: '*', // TODO: Restrict in prod
    credentials: true,
  });

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
