import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../common/prisma-errors.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

const userInclude = {
  userRoles: { include: { role: true } },
} satisfies Prisma.UserInclude;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      include: userInclude,
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!user) throw new NotFoundException(`User ${id} was not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          ...dto,
          email: dto.email.trim().toLowerCase(),
          fullName: dto.fullName.trim(),
          userRoles: {
            create: [{ role: { connect: { code: 'DEVELOPER' } } }],
          },
        },
        include: userInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const data = {
      ...dto,
      ...(dto.email === undefined ? {} : { email: dto.email.trim().toLowerCase() }),
      ...(dto.fullName === undefined ? {} : { fullName: dto.fullName.trim() }),
    } satisfies Prisma.UserUpdateInput;
    try {
      if (dto.status === 'INACTIVE') {
        return await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sdp-admin-role-invariant'))`;
          await this.assertNotLastActiveAdmin(tx, id);
          return tx.user.update({ where: { id }, data, include: userInclude });
        });
      }
      return await this.prisma.user.update({
        where: { id },
        data,
        include: userInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sdp-admin-role-invariant'))`;
        await this.assertNotLastActiveAdmin(tx, id);
        await tx.userRole.deleteMany({ where: { userId: id } });
        return tx.user.delete({ where: { id } });
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async assertNotLastActiveAdmin(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException(`User ${userId} was not found`);
    const isActiveAdmin = user.status === 'ACTIVE' && user.userRoles.some(({ role }) => role.code === 'ADMIN');
    if (!isActiveAdmin) return;
    const activeAdmins = await tx.user.count({
      where: { status: 'ACTIVE', userRoles: { some: { role: { code: 'ADMIN' } } } },
    });
    if (activeAdmins <= 1) {
      throw new ConflictException('The last active administrator cannot be deactivated or deleted');
    }
  }
}
