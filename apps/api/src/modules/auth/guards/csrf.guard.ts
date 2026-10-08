import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER } from '../auth.constants.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/**
 * Requests that cannot carry the CSRF token: login mints it, and the public
 * password-link endpoints are called before sign-in with `credentials: 'omit'`
 * — they neither send nor trust cookies, so there is no ambient authority to
 * forge. They get an Origin check instead (PublicAuthHeadersInterceptor).
 */
const TOKEN_BOOTSTRAP_PATHS = [
  '/auth/login',
  '/auth/token/validate',
  '/auth/set-password',
  '/auth/forgot-password',
  '/auth/resend-link',
];

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method) || TOKEN_BOOTSTRAP_PATHS.some((path) => request.path.endsWith(path))) return true;
    const cookie = (request.cookies as Record<string, unknown> | undefined)?.[CSRF_COOKIE];
    const header = request.headers[CSRF_HEADER];
    if (typeof cookie !== 'string' || typeof header !== 'string') {
      throw new ForbiddenException('Invalid CSRF token');
    }
    const expected = Buffer.from(cookie);
    const supplied = Buffer.from(header);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}

