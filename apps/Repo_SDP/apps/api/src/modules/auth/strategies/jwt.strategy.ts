import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  ACCESS_COOKIE,
  JWT_AUDIENCE_DEFAULT,
  JWT_ISSUER_DEFAULT,
  type RoleCode,
} from '../auth.constants.js';
import { authSecret, authSettings } from '../auth.config.js';
import type { AuthenticatedUser, JwtPayload } from '../auth.types.js';

function accessCookie(request: Request): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[ACCESS_COOKIE];
  return typeof token === 'string' ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = authSecret(config, 'JWT_ACCESS_SECRET');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([accessCookie]),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: config.get<string>('JWT_ISSUER') ?? JWT_ISSUER_DEFAULT,
      audience: config.get<string>('JWT_AUDIENCE') ?? JWT_AUDIENCE_DEFAULT,
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  async validate(
    reqOrPayload: Request | JwtPayload,
    maybePayload?: JwtPayload,
  ): Promise<AuthenticatedUser> {
    const payload = (maybePayload ?? reqOrPayload) as JwtPayload;
    const req = maybePayload ? (reqOrPayload as Request) : undefined;

    if (payload.typ !== 'access') throw new UnauthorizedException();
    // The access token is only as good as the session it was issued for. When
    // logout, a password change, deactivation or an email change revokes the
    // session, the 15-minute access token stops working at once too.
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
      select: {
        id: true,
        lastActiveAt: true,
        createdAt: true,
        user: {
          include: {
            userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
          },
        },
      },
    });
    const user = session?.user;
    if (!session || user?.status !== 'ACTIVE') throw new UnauthorizedException();

    const settings = authSettings(this.config);
    const now = Date.now();
    const lastActive = (session.lastActiveAt ?? session.createdAt)?.getTime() ?? now;

    // Enforce 4-hour server-side idle timeout
    if (now - lastActive >= settings.idleTtl * 1000) {
      await this.prisma.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(now) },
      });
      throw new UnauthorizedException();
    }

    // Passive polling routes (e.g. notifications) do not extend user idle time
    const isBackground =
      req?.headers?.['x-background-request'] === 'true' ||
      (req?.path?.includes('/notifications') && req?.method === 'GET');

    // Throttled update of lastActiveAt: update if >= activityThrottle (default 5 minutes)
    if (!isBackground && now - lastActive >= settings.activityThrottle * 1000) {
      await this.prisma.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          lastActiveAt: { lte: new Date(now - settings.activityThrottle * 1000) },
        },
        data: { lastActiveAt: new Date(now) },
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.fullName,
      roles: user.userRoles.map(({ role }) => role.code as RoleCode),
      isActive: true,
      createdAt: user.createdAt,
      sessionId: payload.sid,
    };
  }
}
