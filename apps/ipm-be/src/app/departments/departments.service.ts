import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { Department } from '@sebsa-pm-tool/shared-models';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Department[]> {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
