import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { UserSummary } from '@sebsa-pm-tool/shared-models';

const SEARCH_RESULT_LIMIT = 20;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
      select: { id: true, name: true, email: true, departmentId: true },
    });
  }
}
