import { ForbiddenException } from '@nestjs/common';

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV?.trim().toLowerCase() === 'production';
}

export function getAllowedWebOrigins(): string[] {
  const configuredOrigins = process.env.FRONTEND_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    for (const origin of configuredOrigins) {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error('FRONTEND_ORIGINS must contain valid HTTP(S) origins');
      }
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        parsed.hostname.includes('*')
      ) {
        throw new Error(
          'FRONTEND_ORIGINS must contain exact HTTP(S) origins without paths or wildcards',
        );
      }
    }
    return configuredOrigins;
  }

  if (isProductionEnvironment()) {
    throw new Error('FRONTEND_ORIGINS must be configured in production');
  }

  return ['http://localhost:5173'];
}

/** Fail at startup rather than creating a session with unusable cookie settings. */
export function validateCookieConfiguration(): void {
  const sameSite =
    process.env.REFRESH_COOKIE_SAME_SITE?.trim().toLowerCase() ?? 'lax';
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('REFRESH_COOKIE_SAME_SITE must be lax, strict, or none');
  }
  if (sameSite === 'none' && !isProductionEnvironment()) {
    throw new Error('SameSite=None requires HTTPS in this configuration');
  }
}

/** Checks cookie-backed auth writes against the configured browser origins. */
export function assertTrustedOrigin(origin: string | undefined): void {
  if (!origin) {
    if (isProductionEnvironment()) {
      throw new ForbiddenException('Origin header is required');
    }
    return;
  }

  if (!getAllowedWebOrigins().includes(origin)) {
    throw new ForbiddenException('Origin is not allowed');
  }
}
