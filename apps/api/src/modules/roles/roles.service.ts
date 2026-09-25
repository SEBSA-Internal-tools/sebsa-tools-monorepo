import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: { _count: { select: { userRoles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: { user: true, grantor: true },
          orderBy: { grantedAt: 'desc' },
        },
      },
    });
    if (!role) throw new NotFoundException(`Role ${id} was not found`);
    return role;
  }

  async create(dto: CreateRoleDto) {
    try {
      return await this.prisma.role.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
        },
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: number, dto: UpdateRoleDto) {
    await this.findOne(id);
    try {
      return await this.prisma.role.update({
        where: { id },
        data: {
          ...(dto.code === undefined ? {} : { code: dto.code.trim().toUpperCase() }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description?.trim() ?? null }),
        },
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    try {
      await this.prisma.role.delete({ where: { id } });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
}
