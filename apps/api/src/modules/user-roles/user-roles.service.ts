import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { CreateUserRoleDto } from './dto/create-user-role.dto.js';
import type { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import type { UserRoleQueryDto } from './dto/user-role-query.dto.js';
import type { RoleCode } from '../auth/auth.constants.js';

const userRoleInclude = { user: true, role: true, grantor: true } as const;
const userInclude = { userRoles: { include: { role: true } } } as const;

@Injectable()
export class UserRolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: UserRoleQueryDto = {}) {
    return this.prisma.userRole.findMany({
      where: {
        ...(query.userId === undefined ? {} : { userId: query.userId }),
        ...(query.roleId === undefined ? {} : { roleId: query.roleId }),
      },
      include: userRoleInclude,
      orderBy: { grantedAt: 'desc' },
    });
  }

  async findOne(userId: string, roleId: number) {
    const userRole = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
      include: userRoleInclude,
    });
    if (!userRole) {
      throw new NotFoundException(
        `Role ${roleId} is not assigned to user ${userId}`,
      );
    }
    return userRole;
  }

  async create(dto: CreateUserRoleDto) {
    await this.validateReferences(dto.userId, dto.roleId, dto.grantedBy);
    try {
      return await this.prisma.userRole.create({
        data: dto,
        include: userRoleInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(userId: string, roleId: number, dto: UpdateUserRoleDto) {
    await this.findOne(userId, roleId);
    if (dto.grantedBy) await this.assertUser(dto.grantedBy, 'Grantor');
    try {
      return await this.prisma.userRole.update({
        where: { userId_roleId: { userId, roleId } },
        data: dto.grantedBy === undefined ? {} : { grantedBy: dto.grantedBy },
        include: userRoleInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(userId: string, roleId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sdp-admin-role-invariant'))`;
      const assignment = await tx.userRole.findUnique({
        where: { userId_roleId: { userId, roleId } },
        include: { user: true, role: true },
      });
      if (!assignment) {
        throw new NotFoundException(`Role ${roleId} is not assigned to user ${userId}`);
      }
      if (assignment.role.code === 'ADMIN' && assignment.user.status === 'ACTIVE') {
        const activeAdmins = await tx.user.count({
          where: { status: 'ACTIVE', userRoles: { some: { role: { code: 'ADMIN' } } } },
        });
        if (activeAdmins <= 1) {
          throw new ConflictException('The last active administrator cannot be demoted');
        }
      }
      await tx.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
    });
  }

  async findForUser(userId: string) {
    await this.assertUser(userId, 'User');
    return this.findAll({ userId });
  }

  async replaceForUser(userId: string, roleCodes: RoleCode[], grantedBy: string) {
    await this.assertUser(userId, 'User');
    const roles = await this.prisma.role.findMany({ where: { code: { in: roleCodes } } });
    if (roles.length !== roleCodes.length) throw new NotFoundException('One or more roles were not found');

    return this.prisma.$transaction(async (tx) => {
      // Serialise changes that could affect the last-admin invariant. Without
      // this lock, two admins could demote each other concurrently after both
      // observed that another active administrator still existed.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sdp-admin-role-invariant'))`;
      const currentlyAdmin = await tx.userRole.findFirst({
        where: { userId, role: { code: 'ADMIN' } },
      });
      if (currentlyAdmin && !roleCodes.includes('ADMIN')) {
        const activeAdmins = await tx.user.count({
          where: { status: 'ACTIVE', userRoles: { some: { role: { code: 'ADMIN' } } } },
        });
        if (activeAdmins <= 1) {
          throw new ConflictException('The last active administrator cannot be demoted');
        }
      }

      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id, grantedBy })),
      });
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: userInclude,
      });
    });
  }

  private async validateReferences(
    userId: string,
    roleId: number,
    grantedBy?: string | null,
  ): Promise<void> {
    const [user, role, grantor] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
      this.prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true },
      }),
      grantedBy
        ? this.prisma.user.findUnique({
            where: { id: grantedBy },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!user) throw new NotFoundException(`User ${userId} was not found`);
    if (!role) throw new NotFoundException(`Role ${roleId} was not found`);
    if (grantedBy && !grantor) {
      throw new NotFoundException(`Grantor ${grantedBy} was not found`);
    }
  }

  private async assertUser(userId: string, label: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException(`${label} ${userId} was not found`);
  }
}
