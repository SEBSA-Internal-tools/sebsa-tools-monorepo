import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, LoginResponse, RegisterResponse } from '@sebsa-pm-tool/shared-models';
import * as bcrypt from 'bcryptjs';
import { hashPassword, needsRehash } from './password';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    if (!user.approvedAt) {
      throw new UnauthorizedException('Your account is pending administrator approval.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Contact your System Administrator.',
      );
    }

    await this.upgradeHashIfStale(user.id, user.passwordHash, password);

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

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const domain = dto.email.split('@')[1]?.toLowerCase();
    const allowedDomains = this.configService.get<string[]>('auth.signupAllowedDomains') ?? [];

    if (!domain || !allowedDomains.includes(domain)) {
      throw new ForbiddenException('Signup is restricted to corporate email addresses.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department) {
      throw new BadRequestException('Invalid department.');
    }

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        departmentId: dto.departmentId,
        systemRole: 'REGULAR_USER',
        isActive: true,
        approvedAt: null,
      },
    });

    return {
      message: 'Registered. An administrator will approve your account before you can log in.',
    };
  }

  /** Re-hashes at the current cost factor once the password is known good.
   * Failure is swallowed: a login must not break because an upgrade did. */
  private async upgradeHashIfStale(
    userId: string,
    passwordHash: string,
    plainText: string,
  ): Promise<void> {
    if (!needsRehash(passwordHash)) return;

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(plainText) },
      });
    } catch {
      // Intentionally ignored.
    }
  }

  private toAuthUser(user: {
    id: string;
    name: string;
    email: string;
    systemRole: string;
    departmentId: string;
    avatarUrl?: string | null;
  }): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      systemRole: user.systemRole as AuthUser['systemRole'],
      departmentId: user.departmentId,
      avatarUrl: user.avatarUrl,
    };
  }
}
