import { afterEach, describe, expect, it } from 'vitest';
import {
  assertTrustedOrigin,
  getAllowedWebOrigins,
  isProductionEnvironment,
  validateCookieConfiguration,
} from './auth-origin.js';

const original = { ...process.env };
afterEach(() => {
  for (const key of [
    'NODE_ENV',
    'FRONTEND_ORIGINS',
    'REFRESH_COOKIE_SAME_SITE',
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('Authentication origin and cookie configuration', () => {
  it.each([
    '*',
    'https://example.test/',
    'https://example.test/path',
    'https://user:pass@example.test',
    'file:///tmp/test',
    'https://*.example.test',
  ])('refuses ambiguous or unsafe origin %s', (origin) => {
    process.env.FRONTEND_ORIGINS = origin;
    expect(() => getAllowedWebOrigins()).toThrow(/HTTP\(S\) origins/);
  });

  it('requires explicit origins and an Origin header in production, including normalized environment values', () => {
    process.env.NODE_ENV = ' Production ';
    delete process.env.FRONTEND_ORIGINS;
    expect(isProductionEnvironment()).toBe(true);
    expect(() => getAllowedWebOrigins()).toThrow(/configured in production/);
    process.env.FRONTEND_ORIGINS = 'https://survey.example.test';
    expect(() => assertTrustedOrigin(undefined)).toThrow(
      /Origin header is required/,
    );
    expect(() =>
      assertTrustedOrigin('https://survey.example.test.attacker.test'),
    ).toThrow(/not allowed/);
    expect(() =>
      assertTrustedOrigin('https://survey.example.test'),
    ).not.toThrow();
  });

  it('uses the documented local origin only outside production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.FRONTEND_ORIGINS;
    expect(getAllowedWebOrigins()).toEqual(['http://localhost:5173']);
    expect(() => assertTrustedOrigin(undefined)).not.toThrow();
  });

  it.each(['lax', 'strict', 'none'])(
    'accepts valid SameSite %s with secure production cookies',
    (sameSite) => {
      process.env.NODE_ENV = 'production';
      process.env.REFRESH_COOKIE_SAME_SITE = sameSite;
      expect(() => validateCookieConfiguration()).not.toThrow();
    },
  );

  it('refuses invalid settings or SameSite=None outside production', () => {
    process.env.REFRESH_COOKIE_SAME_SITE = 'invalid';
    expect(() => validateCookieConfiguration()).toThrow(/lax, strict, or none/);
    process.env.NODE_ENV = 'test';
    process.env.REFRESH_COOKIE_SAME_SITE = 'none';
    expect(() => validateCookieConfiguration()).toThrow(/HTTPS/);
  });
});
