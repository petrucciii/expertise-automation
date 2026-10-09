import { ForbiddenException } from '@nestjs/common';

export function getAllowedWebOrigins(): string[] {
  const configuredOrigins = process.env.FRONTEND_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    return configuredOrigins;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_ORIGINS must be configured in production');
  }

  return ['http://localhost:5173'];
}

/** Checks cookie-backed auth writes against the configured browser origins. */
export function assertTrustedOrigin(origin: string | undefined): void {
  if (!origin) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Origin header is required');
    }
    return;
  }

  if (!getAllowedWebOrigins().includes(origin)) {
    throw new ForbiddenException('Origin is not allowed');
  }
}
