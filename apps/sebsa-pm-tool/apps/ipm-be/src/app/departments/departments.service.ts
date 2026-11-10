import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { Department } from '@sebsa-pm-tool/shared-models';
import { Prisma } from '@prisma/client';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Department[]> {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async create(dto: CreateDepartmentDto): Promise<Department> {
    const name = this.normalizeName(dto.name);
    await this.assertNameAvailable(name);

    try {
      return await this.prisma.department.create({
        data: { name },
        select: { id: true, name: true },
      });
    } catch (error) {
      this.rethrowNameConflict(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<Department> {
    await this.getOrThrow(id);
    const name = this.normalizeName(dto.name);
    await this.assertNameAvailable(name, id);

    try {
      return await this.prisma.department.update({
        where: { id },
        data: { name },
        select: { id: true, name: true },
      });
    } catch (error) {
      this.rethrowNameConflict(error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    const userCount = await this.prisma.user.count({
      where: { departmentId: id },
    });
    if (userCount > 0) {
      throw new ConflictException(
        `Cannot delete this department while ${userCount} user(s) are assigned to it.`,
      );
    }

    try {
      await this.prisma.department.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete this department while users are assigned to it.',
        );
      }
      throw error;
    }
  }

  private async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.department.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A department with this name already exists.');
    }
  }

  private normalizeName(value: string): string {
    const name = value.trim();
    if (name.length < 2) {
      throw new BadRequestException('Department name must contain at least 2 characters.');
    }
    return name;
  }

  private rethrowNameConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A department with this name already exists.');
    }
  }

  private async getOrThrow(id: string): Promise<void> {
    const department = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found.');
    }
  }
}
