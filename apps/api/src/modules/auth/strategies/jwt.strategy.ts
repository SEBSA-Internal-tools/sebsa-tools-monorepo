import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ACCESS_COOKIE, JWT_AUDIENCE_DEFAULT, JWT_ISSUER_DEFAULT, type RoleCode } from '../auth.constants.js';
import { authSecret } from '../auth.config.js';
import type { AuthenticatedUser, JwtPayload } from '../auth.types.js';

function accessCookie(request: Request): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[ACCESS_COOKIE];
  return typeof token === 'string' ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    const secret = authSecret(config, 'JWT_ACCESS_SECRET');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([accessCookie]),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: config.get<string>('JWT_ISSUER') ?? JWT_ISSUER_DEFAULT,
      audience: config.get<string>('JWT_AUDIENCE') ?? JWT_AUDIENCE_DEFAULT,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== 'access') throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });
    if (user?.status !== 'ACTIVE') throw new UnauthorizedException();
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
