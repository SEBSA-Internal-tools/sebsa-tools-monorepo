import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, CreateUserResponse, UserAdminSummary, UserProfileDto, UserSummary } from '@sebsa-pm-tool/shared-models';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const SEARCH_RESULT_LIMIT = 20;
const TEMP_PASSWORD_BYTES = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User profile not found.');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      departmentId: user.departmentId,
      departmentName: user.department?.name,
      systemRole: user.systemRole as UserProfileDto['systemRole'],
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      avatarUrl: user.avatarUrl,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileDto> {
    await this.updateOrThrow(userId, { name: dto.name.trim() });
    return this.getProfile(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found.');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match our records.');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { success: true, message: 'Password changed successfully.' };
  }

  async search(term?: string): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: SEARCH_RESULT_LIMIT,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, departmentId: true, avatarUrl: true },
    });
  }

  async listPending(): Promise<UserAdminSummary[]> {
    const users = await this.prisma.user.findMany({
      where: { approvedAt: null, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => this.toAdminSummary(user));
  }

  async listAll(): Promise<UserAdminSummary[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toAdminSummary(user));
  }

  async approve(id: string): Promise<UserAdminSummary> {
    const user = await this.updateOrThrow(id, { approvedAt: new Date() });
    return this.toAdminSummary(user);
  }

  async setActive(id: string, isActive: boolean): Promise<UserAdminSummary> {
    const user = await this.updateOrThrow(id, { isActive });
    return this.toAdminSummary(user);
  }

  async create(dto: CreateUserDto, requestedBy: AuthUser): Promise<CreateUserResponse> {
    if (dto.systemRole === 'SUPER_ADMIN' && requestedBy.systemRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only a Super Admin can grant the Super Admin role.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    // Admin-created accounts are auto-approved (no separate approval step);
    // a random temporary password is generated and returned exactly once
    // for the admin to relay, rather than storing/emailing it anywhere.
    const temporaryPassword = randomBytes(TEMP_PASSWORD_BYTES).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        departmentId: dto.departmentId,
        systemRole: dto.systemRole,
        isActive: true,
        approvedAt: new Date(),
      },
    });

    return { user: this.toAdminSummary(user), temporaryPassword };
  }

  private async updateOrThrow(id: string, data: Prisma.UserUpdateInput) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found.');
    }
    return this.prisma.user.update({ where: { id }, data });
  }

  private toAdminSummary(user: {
    id: string;
    name: string;
    email: string;
    departmentId: string;
    systemRole: string;
    isActive: boolean;
    approvedAt: Date | null;
    createdAt: Date;
    avatarUrl?: string | null;
  }): UserAdminSummary {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      departmentId: user.departmentId,
      systemRole: user.systemRole as UserAdminSummary['systemRole'],
      isActive: user.isActive,
      approvedAt: user.approvedAt ? user.approvedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      avatarUrl: user.avatarUrl,
    };
  }
}
