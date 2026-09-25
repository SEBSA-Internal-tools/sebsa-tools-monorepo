import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash, verify } from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authSecret, authSettings } from './auth.config.js';
import { ROLE_LABELS, type RoleCode } from './auth.constants.js';
import type { JwtPayload } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const userWithRoles = { userRoles: { include: { role: true } } } as const;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userWithRoles }>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

export interface RequestMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, metadata: RequestMetadata) {
    const passwordHash = await this.hashPassword(dto.password);
    let user: UserWithRoles;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          fullName: dto.fullName.trim(),
          passwordHash,
          userRoles: {
            create: { role: { connect: { code: 'DEVELOPER' } } },
          },
        },
        include: userWithRoles,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
    const tokens = await this.createSession(user.id, false, metadata);
    return { user: this.toCurrentUser(user), tokens };
  }

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: userWithRoles,
    });
    if (!user?.passwordHash || user.status !== 'ACTIVE') this.invalidCredentials();
    const valid = await verify(user.passwordHash, dto.password);
    if (!valid) this.invalidCredentials();

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.createSession(user.id, dto.remember ?? false, metadata);
    return { user: this.toCurrentUser(user), tokens };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException();
    const settings = authSettings(this.config);
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: authSecret(this.config, 'JWT_REFRESH_SECRET'),
        issuer: settings.issuer,
        audience: settings.audience,
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException();

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: { user: { include: userWithRoles } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    if (!(await verify(session.tokenHash, refreshToken))) {
      await this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }

    const refreshTtl = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    const tokens = await this.signTokens(session.userId, session.id, refreshTtl);
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { tokenHash: await this.hashToken(tokens.refreshToken), lastUsedAt: new Date() },
    });
    return { user: this.toCurrentUser(session.user), tokens };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const settings = authSettings(this.config);
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: authSecret(this.config, 'JWT_REFRESH_SECRET'),
        issuer: settings.issuer,
        audience: settings.audience,
        ignoreExpiration: true,
      });
      await this.prisma.refreshSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Logout is idempotent; invalid cookies are cleared by the controller.
    }
  }

  currentUser(user: UserWithRoles) {
    return this.toCurrentUser(user);
  }

  private async createSession(userId: string, remember: boolean, metadata: RequestMetadata) {
    const settings = authSettings(this.config);
    const sessionId = randomUUID();
    const refreshTtl = remember ? settings.rememberTtl : settings.refreshTtl;
    const tokens = await this.signTokens(userId, sessionId, refreshTtl);
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: await this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        ...(metadata.userAgent ? { userAgent: metadata.userAgent.slice(0, 500) } : {}),
        ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress.slice(0, 64) } : {}),
      },
    });
    return tokens;
  }

  private async signTokens(userId: string, sessionId: string, refreshTtl: number): Promise<AuthTokens> {
    const settings = authSettings(this.config);
    const common = { sub: userId, sid: sessionId, iss: settings.issuer, aud: settings.audience };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...common, jti: randomUUID(), typ: 'access' satisfies JwtPayload['typ'] },
        { secret: authSecret(this.config, 'JWT_ACCESS_SECRET'), expiresIn: settings.accessTtl },
      ),
      this.jwt.signAsync(
        { ...common, jti: randomUUID(), typ: 'refresh' satisfies JwtPayload['typ'] },
        { secret: authSecret(this.config, 'JWT_REFRESH_SECRET'), expiresIn: refreshTtl },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      accessMaxAgeMs: settings.accessTtl * 1000,
      refreshMaxAgeMs: refreshTtl * 1000,
    };
  }

  private toCurrentUser(user: UserWithRoles) {
    return {
      id: user.id,
      email: user.email,
      name: user.fullName,
      roles: user.userRoles.map(({ role }) => ROLE_LABELS[role.code as RoleCode]),
      isActive: user.status === 'ACTIVE',
      createdAt: user.createdAt.toISOString(),
    };
  }

  private hashPassword(password: string) {
    return hash(password, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  }

  private hashToken(token: string) {
    return hash(token, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  }

  private invalidCredentials(): never {
    throw new UnauthorizedException('Invalid email or password');
  }
}
