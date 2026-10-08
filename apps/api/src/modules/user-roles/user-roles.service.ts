import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { isRoleCode, type RoleCode } from '../auth/auth.constants.js';
import type { CreateUserRoleDto } from './dto/create-user-role.dto.js';
import type { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import type { UserRoleQueryDto } from './dto/user-role-query.dto.js';
import { assertCanGrantRoles, assertCanManageUser } from './role-policy.js';
import { assertNotLastActiveRoleHolder, lockPrivilegedRoleInvariants } from './role-invariants.js';
import { assignedRoleCodes, toUserResponse } from '../users/user-response.js';
import { AuditService } from '../audit/audit.service.js';

const safeUserSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  createdAt: true,
} as const;
const userRoleInclude = {
  user: { select: safeUserSelect },
  role: true,
  grantor: { select: safeUserSelect },
} as const;
const userInclude = {
  userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
} satisfies Prisma.UserInclude;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class UserRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(query: UserRoleQueryDto = {}) {
    return this.prisma.userRole.findMany({
      where: {
        ...(query.userId === undefined ? {} : { userId: query.userId }),
        ...(query.roleId === undefined ? {} : { roleId: query.roleId }),
        user: { deletedAt: null },
        role: { deletedAt: null },
      },
      include: userRoleInclude,
      orderBy: { grantedAt: 'desc' },
    });
  }

  async findOne(userId: string, roleId: number) {
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId, roleId, user: { deletedAt: null }, role: { deletedAt: null } },
      include: userRoleInclude,
    });
    if (!userRole) {
      throw new NotFoundException(`Role ${roleId} is not assigned to user ${userId}`);
    }
    return userRole;
  }

  async create(dto: CreateUserRoleDto, actor: AuthenticatedUser) {
    const [user, role] = await Promise.all([this.getUser(dto.userId), this.getRole(dto.roleId)]);
    const roleCode = this.availableRoleCode(role.code);
    assertCanGrantRoles(actor, assignedRoleCodes(user), [roleCode]);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.userRole.create({
          data: { userId: dto.userId, roleId: dto.roleId, grantedBy: actor.id },
          include: userRoleInclude,
        });
        await this.audit.record(tx, actor, {
          actionType: 'ROLE_GRANTED',
          entityType: 'ROLE',
          entityId: String(role.id),
          targetUserId: user.id,
          description: `${actor.name} granted ${role.name} role to ${user.fullName}`,
          oldValue: currentRoleValue(user),
          newValue: [...assignedRoleCodes(user), roleCode],
        });
        return assignment;
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(userId: string, roleId: number, dto: UpdateUserRoleDto, actor: AuthenticatedUser) {
    const user = await this.getUser(userId);
    assertCanManageUser(actor, assignedRoleCodes(user));
    await this.findOne(userId, roleId);

    try {
      return await this.prisma.userRole.update({
        where: { userId_roleId: { userId, roleId } },
        data: { grantedBy: dto.grantedBy ?? actor.id },
        include: userRoleInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(userId: string, roleId: number, actor: AuthenticatedUser): Promise<void> {
    const user = await this.getUser(userId);
    const role = await this.getRole(roleId);
    const roleCode = this.availableRoleCode(role.code);
    const currentRoles = assignedRoleCodes(user);
    if (currentRoles.length <= 1) {
      throw new ConflictException('A user must retain at least one role');
    }
    assertCanGrantRoles(
      actor,
      currentRoles,
      currentRoles.filter((code) => code !== roleCode),
    );

    await this.prisma.$transaction(async (tx) => {
      await lockPrivilegedRoleInvariants(tx);
      const assignment = await tx.userRole.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });
      if (!assignment) {
        throw new NotFoundException(`Role ${roleId} is not assigned to user ${userId}`);
      }
      await assertNotLastActiveRoleHolder(tx, user, [roleCode], 'demoted');
      await tx.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
      await this.audit.record(tx, actor, {
        actionType: 'ROLE_REMOVED',
        entityType: 'ROLE',
        entityId: String(role.id),
        targetUserId: user.id,
        description: `${actor.name} removed ${role.name} role from ${user.fullName}`,
        oldValue: currentRoles,
        newValue: currentRoles.filter((code) => code !== roleCode),
      });
    });
  }

  async findForUser(userId: string) {
    await this.getUser(userId);
    return this.findAll({ userId });
  }

  async replaceForUser(userId: string, roleCodes: RoleCode[], actor: AuthenticatedUser) {
    const user = await this.getUser(userId);
    const currentRoles = assignedRoleCodes(user);
    assertCanGrantRoles(actor, currentRoles, roleCodes);

    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes }, deletedAt: null },
    });
    if (roles.length !== roleCodes.length) {
      throw new NotFoundException('One or more roles were not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockPrivilegedRoleInvariants(tx);
      await assertNotLastActiveRoleHolder(
        tx,
        user,
        currentRoles.filter((role) => !roleCodes.includes(role)),
        'demoted',
      );

      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id, grantedBy: actor.id })),
      });
      const result = await tx.user.findUniqueOrThrow({
        where: { id: userId, deletedAt: null },
        include: userInclude,
      });
      await this.audit.record(tx, actor, {
        actionType: 'ROLES_CHANGED',
        entityType: 'USER',
        entityId: userId,
        targetUserId: userId,
        description: `${actor.name} changed roles for ${user.fullName}`,
        oldValue: currentRoles,
        newValue: roleCodes,
      });
      return result;
    });

    return toUserResponse(updated);
  }

  async transferSuperAdmin(targetUserId: string, actor: AuthenticatedUser) {
    if (targetUserId === actor.id) {
      throw new BadRequestException('Super Admin ownership must be transferred to another user');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockPrivilegedRoleInvariants(tx);

        const roles = await tx.role.findMany({
          where: { code: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null },
        });
        const adminRole = roles.find((role) => role.code === 'ADMIN');
        const superAdminRole = roles.find((role) => role.code === 'SUPER_ADMIN');
        if (!adminRole || !superAdminRole) {
          throw new ConflictException('Admin and Super Admin roles must be configured');
        }

        const currentAssignments = await tx.userRole.findMany({
          where: { roleId: superAdminRole.id },
          include: { user: { include: userInclude } },
        });
        if (currentAssignments.length !== 1) {
          throw new ConflictException('The system must have exactly one Super Admin');
        }

        const currentAssignment = currentAssignments[0]!;
        if (currentAssignment.userId !== actor.id) {
          throw new ConflictException('Only the current Super Admin can transfer ownership');
        }

        const target = await tx.user.findFirst({
          where: { id: targetUserId, status: 'ACTIVE', deletedAt: null },
          include: userInclude,
        });
        if (!target) {
          throw new NotFoundException(`Active user ${targetUserId} was not found`);
        }
        if (!assignedRoleCodes(target).includes('ADMIN')) {
          throw new BadRequestException('Only an existing Admin can become Super Admin');
        }

        await tx.userRole.upsert({
          where: { userId_roleId: { userId: actor.id, roleId: adminRole.id } },
          create: { userId: actor.id, roleId: adminRole.id, grantedBy: actor.id },
          update: {},
        });
        await tx.userRole.delete({
          where: { userId_roleId: { userId: actor.id, roleId: superAdminRole.id } },
        });
        await tx.userRole.create({
          data: { userId: target.id, roleId: superAdminRole.id, grantedBy: actor.id },
        });
        await tx.userRole.deleteMany({
          where: { userId: target.id, roleId: { not: superAdminRole.id } },
        });

        const updatedTarget = await tx.user.findUniqueOrThrow({
          where: { id: target.id },
          include: userInclude,
        });
        await this.audit.record(tx, actor, {
          actionType: 'SUPER_ADMIN_TRANSFERRED',
          entityType: 'USER',
          entityId: target.id,
          targetUserId: target.id,
          description: `${actor.name} transferred Super Admin ownership to ${target.fullName}`,
          oldValue: { superAdminUserId: actor.id },
          newValue: { superAdminUserId: target.id },
        });
        return toUserResponse(updatedTarget);
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async getUser(userId: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userInclude,
    });
    if (!user) throw new NotFoundException(`User ${userId} was not found`);
    return user;
  }

  private async getRole(roleId: number) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, deletedAt: null } });
    if (!role) throw new NotFoundException(`Role ${roleId} was not found`);
    return role;
  }

  private availableRoleCode(code: string): RoleCode {
    if (!isRoleCode(code)) {
      throw new BadRequestException(`Role ${code} is not available for assignment`);
    }
    return code;
  }
}

function currentRoleValue(user: UserWithRoles): RoleCode[] {
  return assignedRoleCodes(user);
}
