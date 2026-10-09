import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser, Public } from '@nestjs/authentication';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { assertTrustedOrigin } from './auth-origin.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { AuthenticatedUser } from '../users/user.type.js';

const REFRESH_TOKEN_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVELOPMENT_REFRESH_COOKIE = 'refresh_token';
const PRODUCTION_REFRESH_COOKIE = '__Host-refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Req() request: Request, @Body() dto: RegisterDto) {
    assertTrustedOrigin(request.headers.origin);
    return this.authService.register(dto.email, dto.password);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: LoginDto,
  ) {
    assertTrustedOrigin(request.headers.origin);
    const { user, tokens } = await this.authService.login(
      dto.email,
      dto.password,
    );

    response.cookie(
      refreshCookieName(),
      tokens.refreshToken,
      refreshCookieOptions(REFRESH_TOKEN_COOKIE_TTL_MS),
    );

    // The refresh token is only sent in the HttpOnly cookie.
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedOrigin(request.headers.origin);
    const refreshToken = request.cookies?.[refreshCookieName()];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    const tokens = await this.authService.refresh(refreshToken);
    response.cookie(
      refreshCookieName(),
      tokens.refreshToken,
      refreshCookieOptions(REFRESH_TOKEN_COOKIE_TTL_MS),
    );

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    assertTrustedOrigin(request.headers.origin);
    await this.authService.logout(request.cookies?.[refreshCookieName()]);
    response.clearCookie(refreshCookieName(), refreshCookieOptions());
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutEverywhere(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    assertTrustedOrigin(request.headers.origin);
    await this.authService.logoutEverywhere(user.id);
    response.clearCookie(refreshCookieName(), refreshCookieOptions());
  }

  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

function refreshCookieName(): string {
  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_REFRESH_COOKIE
    : DEVELOPMENT_REFRESH_COOKIE;
}

function refreshCookieOptions(maxAge?: number): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredSameSite =
    process.env.REFRESH_COOKIE_SAME_SITE?.toLowerCase();
  const sameSite: CookieOptions['sameSite'] =
    configuredSameSite === 'none' ? 'none' : 'lax';

  if (sameSite === 'none' && !isProduction) {
    throw new Error('SameSite=None requires HTTPS in this configuration');
  }

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite,
    // __Host- cookies require Secure, no Domain, and Path=/.
    path: isProduction ? '/' : '/api/auth',
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}
