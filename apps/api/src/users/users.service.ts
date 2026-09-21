import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../common/prisma-errors.js';
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

const userInclude = {
  userRoles: { where: { role: { deletedAt: null } }, include: { role: true } },
} satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
      const user = await this.prisma.user.create({
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
      if (dto.isActive === false) {
        const user = await this.prisma.$transaction(async (tx) => {
          await lockPrivilegedRoleInvariants(tx);
          await assertNotLastActiveRoleHolder(
            tx,
            existing,
            assignedRoleCodes(existing),
            'deactivated or deleted',
          );
          return tx.user.update({ where: { id }, data, include: userInclude });
        });
        return toUserResponse(user);
      }

      const user = await this.prisma.user.update({
        where: { id },
        data,
        include: userInclude,
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
