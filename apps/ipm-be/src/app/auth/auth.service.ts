import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, LoginResponse } from '@sebsa-pm-tool/shared-models';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Contact your System Administrator.',
      );
    }

    return this.toAuthUser(user);
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.validateUser(dto.email, dto.password);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      systemRole: user.systemRole,
    });

    return { accessToken, user };
  }

  private toAuthUser(user: {
    id: string;
    name: string;
    email: string;
    systemRole: string;
    departmentId: string;
  }): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      systemRole: user.systemRole as AuthUser['systemRole'],
      departmentId: user.departmentId,
    };
  }
}
