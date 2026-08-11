import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, Sprint, SprintSummary } from '@sebsa-pm-tool/shared-models';
import { Prisma } from '@prisma/client';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const sprintDetailInclude = {
  _count: { select: { tasks: true } },
} satisfies Prisma.SprintInclude;

type SprintWithDetail = Prisma.SprintGetPayload<{ include: typeof sprintDetailInclude }>;

@Injectable()
export class SprintsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateSprintDto, user: AuthUser): Promise<Sprint> {
    await this.assertCanManageSprints(projectId, user);
    this.assertValidDateRange(dto.startDate, dto.endDate);

    const created = await this.prisma.sprint.create({
      data: {
        projectId,
        name: dto.name,
        goal: dto.goal,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
      include: sprintDetailInclude,
    });

    return this.toSprint(created);
  }

  async findByProject(projectId: string, user: AuthUser): Promise<SprintSummary[]> {
    await this.assertCanAccessProject(projectId, user);

    const sprints = await this.prisma.sprint.findMany({
      where: { projectId },
      include: sprintDetailInclude,
      orderBy: { createdAt: 'desc' },
    });

    return sprints.map((sprint) => this.toSprintSummary(sprint));
  }

  async findOne(id: string, projectId: string, user: AuthUser): Promise<Sprint> {
    await this.assertCanAccessProject(projectId, user);

    const sprint = await this.prisma.sprint.findFirst({
      where: { id, projectId },
      include: sprintDetailInclude,
    });

    if (!sprint) {
      throw new NotFoundException('Sprint not found.');
    }

    return this.toSprint(sprint);
  }

  async update(
    id: string,
    projectId: string,
    dto: UpdateSprintDto,
    user: AuthUser,
  ): Promise<Sprint> {
    await this.assertCanManageSprints(projectId, user);

    const existing = await this.prisma.sprint.findFirst({
      where: { id, projectId },
    });

    if (!existing) {
      throw new NotFoundException('Sprint not found.');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    this.assertValidDateRange(startDate.toISOString(), endDate.toISOString());

    if (dto.status === 'ACTIVE') {
      await this.assertOnlyOneActiveSprint(projectId, id);
    }

    const updated = await this.prisma.sprint.update({
      where: { id },
      data: {
        name: dto.name,
        goal: dto.goal,
        startDate,
        endDate,
        status: dto.status,
      },
      include: sprintDetailInclude,
    });

    return this.toSprint(updated);
  }

  async remove(id: string, projectId: string, user: AuthUser): Promise<void> {
    await this.assertCanManageSprints(projectId, user);

    const sprint = await this.prisma.sprint.findFirst({
      where: { id, projectId },
    });

    if (!sprint) {
      throw new NotFoundException('Sprint not found.');
    }

    const taskCount = await this.prisma.task.count({
      where: { sprintId: id },
    });

    if (taskCount > 0) {
      throw new BadRequestException(
        'Cannot delete a sprint with associated tasks. Move or remove tasks first.',
      );
    }

    await this.prisma.sprint.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async assertCanAccessProject(projectId: string, user: AuthUser): Promise<void> {
    const isPrivileged = ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE';

    if (isPrivileged) return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  private async assertCanManageSprints(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });

    if (!membership || !membership.role.privilegeGroup.canManageWorkflow) {
      throw new ForbiddenException(
        'You do not have permission to manage sprints for this project.',
      );
    }
  }

  private async assertOnlyOneActiveSprint(
    projectId: string,
    sprintId: string,
  ): Promise<void> {
    const existing = await this.prisma.sprint.findFirst({
      where: {
        projectId,
        status: 'ACTIVE',
        id: { not: sprintId },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'A project can only have one active sprint at a time.',
      );
    }
  }

  private assertValidDateRange(startDate: string, endDate: string): void {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      throw new BadRequestException('Start date must be before end date.');
    }
  }

  private toSprintSummary(sprint: SprintWithDetail): SprintSummary {
    return {
      id: sprint.id,
      projectId: sprint.projectId,
      name: sprint.name,
      goal: sprint.goal,
      startDate: sprint.startDate.toISOString(),
      endDate: sprint.endDate.toISOString(),
      status: sprint.status,
      taskCount: sprint._count.tasks,
      createdAt: sprint.createdAt.toISOString(),
      updatedAt: sprint.updatedAt.toISOString(),
    };
  }

  private toSprint(sprint: SprintWithDetail): Sprint {
    return this.toSprintSummary(sprint);
  }
}
