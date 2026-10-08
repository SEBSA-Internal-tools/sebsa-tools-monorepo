import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { RoleCode } from '../auth/auth.constants.js';
import { assertCanGrantRoles, assertCanManageUser } from '../user-roles/role-policy.js';
import {
  assertNotLastActiveRoleHolder,
  lockPrivilegedRoleInvariants,
} from '../user-roles/role-invariants.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { assignedRoleCodes, toUserResponse } from './user-response.js';
import { AuditService } from '../audit/audit.service.js';

const userInclude = {
  userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
} satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: userInclude,
      orderBy: { fullName: 'asc' },
    });
    return users.map(toUserResponse);
  }

  async findOne(id: string) {
    return toUserResponse(await this.getUser(id));
  }

  private async getUser(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude,
    });
    if (!user) throw new NotFoundException(`User ${id} was not found`);
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    assertCanGrantRoles(actor, [], dto.roles);
    const roles = await this.findRoles(dto.roles);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email.trim().toLowerCase(),
            fullName: dto.name.trim(),
            userRoles: {
              create: roles.map(
                (role) =>
                  ({
                    grantor: { connect: { id: actor.id } },
                    role: { connect: { id: role.id } },
                  }) satisfies Prisma.UserRoleCreateWithoutUserInput,
              ),
            },
          },
          include: userInclude,
        });
        await this.audit.record(tx, actor, {
          actionType: 'USER_CREATED',
          entityType: 'USER',
          entityId: created.id,
          targetUserId: created.id,
          description: `${actor.name} created user ${created.fullName}`,
          newValue: {
            name: created.fullName,
            email: created.email,
            roles: assignedRoleCodes(created),
            isActive: true,
          },
        });
        for (const [index, role] of roles.entries()) {
          await this.audit.record(tx, actor, {
            actionType: 'ROLE_GRANTED',
            entityType: 'ROLE',
            entityId: String(role.id),
            targetUserId: created.id,
            description: `${actor.name} granted ${role.code} role to ${created.fullName}`,
            oldValue: roles.slice(0, index).map((assignedRole) => assignedRole.code),
            newValue: roles.slice(0, index + 1).map((assignedRole) => assignedRole.code),
          });
        }
        return created;
      });
      return toUserResponse(user);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const existing = await this.getUser(id);
    assertCanManageUser(actor, assignedRoleCodes(existing));

    const data = {
      ...(dto.email === undefined ? {} : { email: dto.email.trim().toLowerCase() }),
      ...(dto.name === undefined ? {} : { fullName: dto.name.trim() }),
      ...(dto.isActive === undefined
        ? {}
        : { status: dto.isActive ? ('ACTIVE' as const) : ('INACTIVE' as const) }),
    } satisfies Prisma.UserUpdateInput;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        if (dto.isActive === false) {
          await lockPrivilegedRoleInvariants(tx);
          await assertNotLastActiveRoleHolder(
            tx,
            existing,
            assignedRoleCodes(existing),
            'deactivated or deleted',
          );
        }
        const updated = await tx.user.update({ where: { id }, data, include: userInclude });
        const actionType =
          dto.isActive === undefined
            ? 'USER_UPDATED'
            : dto.isActive
              ? 'USER_ACTIVATED'
              : 'USER_DEACTIVATED';
        await this.audit.record(tx, actor, {
          actionType,
          entityType: 'USER',
          entityId: id,
          targetUserId: id,
          description: `${actor.name} ${actionType.toLowerCase().replaceAll('_', ' ')} ${existing.fullName}`,
          oldValue: {
            name: existing.fullName,
            email: existing.email,
            roles: assignedRoleCodes(existing),
            isActive: existing.status === 'ACTIVE',
          },
          newValue: {
            name: updated.fullName,
            email: updated.email,
            roles: assignedRoleCodes(updated),
            isActive: updated.status === 'ACTIVE',
          },
        });
        return updated;
      });
      return toUserResponse(user);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.getUser(id);
    assertCanManageUser(actor, assignedRoleCodes(existing));

    try {
      await this.prisma.$transaction(async (tx) => {
        await lockPrivilegedRoleInvariants(tx);
        await assertNotLastActiveRoleHolder(
          tx,
          existing,
          assignedRoleCodes(existing),
          'deactivated or deleted',
        );
        await tx.user.update({
          where: { id },
          data: { status: 'INACTIVE', deletedAt: new Date() },
        });
        await this.audit.record(tx, actor, {
          actionType: 'USER_DELETED',
          entityType: 'USER',
          entityId: id,
          targetUserId: id,
          description: `${actor.name} deleted user ${existing.fullName}`,
          oldValue: {
            name: existing.fullName,
            email: existing.email,
            roles: assignedRoleCodes(existing),
            isActive: existing.status === 'ACTIVE',
          },
          newValue: { isActive: false, deleted: true },
        });
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async findRoles(roleCodes: readonly RoleCode[]) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: [...roleCodes] }, deletedAt: null },
    });
    if (roles.length !== roleCodes.length) {
      throw new NotFoundException('One or more roles were not found');
    }
    return roles;
  }
}
