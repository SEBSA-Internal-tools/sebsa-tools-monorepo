import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { PrivilegeGroup } from '@sebsa-pm-tool/shared-models';
import { PrivilegeGroup as PrismaPrivilegeGroup } from '@prisma/client';
import { CreatePrivilegeGroupDto } from './dto/create-privilege-group.dto';
import { UpdatePrivilegeGroupDto } from './dto/update-privilege-group.dto';

@Injectable()
export class PrivilegeGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PrivilegeGroup[]> {
    const groups = await this.prisma.privilegeGroup.findMany({ orderBy: { name: 'asc' } });
    return groups.map((group) => this.toPrivilegeGroup(group));
  }

  async create(dto: CreatePrivilegeGroupDto): Promise<PrivilegeGroup> {
    const existing = await this.prisma.privilegeGroup.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A privilege group with this name already exists.');
    }
    const group = await this.prisma.privilegeGroup.create({ data: dto });
    return this.toPrivilegeGroup(group);
  }

  async update(id: string, dto: UpdatePrivilegeGroupDto): Promise<PrivilegeGroup> {
    await this.getOrThrow(id);
    const group = await this.prisma.privilegeGroup.update({ where: { id }, data: dto });
    return this.toPrivilegeGroup(group);
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    const rolesUsingGroup = await this.prisma.role.count({ where: { privilegeGroupId: id } });
    if (rolesUsingGroup > 0) {
      throw new ConflictException(
        `Cannot delete: ${rolesUsingGroup} role(s) still use this privilege group.`,
      );
    }
    await this.prisma.privilegeGroup.delete({ where: { id } });
  }

  private async getOrThrow(id: string): Promise<PrismaPrivilegeGroup> {
    const group = await this.prisma.privilegeGroup.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('Privilege group not found.');
    }
    return group;
  }

  private toPrivilegeGroup(group: PrismaPrivilegeGroup): PrivilegeGroup {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      canCreateTask: group.canCreateTask,
      canDeleteTask: group.canDeleteTask,
      canManageMembers: group.canManageMembers,
      canConfigureIntegrations: group.canConfigureIntegrations,
      canManageSprints: group.canManageSprints,
      canManageLabels: group.canManageLabels,
      canCreateCase: group.canCreateCase,
      canEditCase: group.canEditCase,
      canDeleteCase: group.canDeleteCase,
      canEditTask: group.canEditTask,
      canComment: group.canComment,
      isReadOnly: group.isReadOnly,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }
}
