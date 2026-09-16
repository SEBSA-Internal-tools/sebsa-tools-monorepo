import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { Request } from 'express';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token.');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('auth.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    // Re-fetch from the DB rather than trusting the JWT payload, so a
    // deactivation/soft-delete takes effect immediately instead of waiting
    // out the token's remaining lifetime.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      systemRole: user.systemRole as AuthUser['systemRole'],
      departmentId: user.departmentId,
      avatarUrl: user.avatarUrl,
    };

    (request as Request & { user: AuthUser }).user = authUser;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers['authorization'];
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
