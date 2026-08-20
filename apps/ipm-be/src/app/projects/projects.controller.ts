import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  Project,
  ProjectMemberSummary,
  ProjectRole,
  ProjectSummary,
} from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreateWorkflowStageDto } from './dto/create-workflow-stage.dto';
import { ReorderWorkflowStagesDto } from './dto/reorder-workflow-stages.dto';
import {
  UpdateWorkflowStageRequest,
  CreateProjectPriorityRequest,
  UpdateProjectPriorityRequest
} from '@sebsa-pm-tool/shared-models';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projectsService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<ProjectSummary[]> {
    return this.projectsService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projectsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Project> {
    return this.projectsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.projectsService.remove(id, user);
  }

  @Get(':id/roles')
  getRoles(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ProjectRole[]> {
    return this.projectsService.getRoles(id, user);
  }

  @Post(':id/roles')
  createRole(
    @Param('id') id: string,
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectRole> {
    return this.projectsService.createRole(id, dto, user);
  }

  @Patch(':id/roles/:roleId')
  updateRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectRole> {
    return this.projectsService.updateRole(id, roleId, dto, user);
  }

  @Get(':id/members')
  getMembers(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectMemberSummary[]> {
    return this.projectsService.getMembers(id, user);
  }

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectMemberSummary> {
    return this.projectsService.addMember(id, dto, user);
  }

  @Patch(':id/members/:memberId')
  updateMemberRole(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectMemberSummary> {
    return this.projectsService.updateMemberRole(id, memberId, dto, user);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.projectsService.removeMember(id, memberId, user);
  }

  @Get(':id/workflow-stages')
  getWorkflowStages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; order: number; taskCount: number }[]> {
    return this.projectsService.getWorkflowStages(id, user);
  }

  @Post(':id/workflow-stages')
  createWorkflowStage(
    @Param('id') projectId: string,
    @Body() dto: CreateWorkflowStageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; order: number }> {
    return this.projectsService.createWorkflowStage(projectId, dto, user);
  }

  // Declared before the ':stageId' route below so 'reorder' isn't swallowed as a stageId param.
  @Patch(':id/workflow-stages/reorder')
  reorderWorkflowStages(
    @Param('id') projectId: string,
    @Body() dto: ReorderWorkflowStagesDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; order: number }[]> {
    return this.projectsService.reorderWorkflowStages(projectId, dto.stageIds, user);
  }

  @Patch(':id/workflow-stages/:stageId')
  updateWorkflowStage(
    @Param('id') projectId: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateWorkflowStageRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; order: number }> {
    return this.projectsService.updateWorkflowStage(projectId, stageId, dto, user);
  }

  @Delete(':id/workflow-stages/:stageId')
  deleteWorkflowStage(
    @Param('id') projectId: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.projectsService.deleteWorkflowStage(projectId, stageId, user);
  }

  @Get(':id/priorities')
  getProjectPriorities(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; order: number; color: string | null }[]> {
    return this.projectsService.getProjectPriorities(id, user);
  }

  @Post(':id/priorities')
  createProjectPriority(
    @Param('id') projectId: string,
    @Body() dto: CreateProjectPriorityRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; order: number; color: string | null }> {
    return this.projectsService.createProjectPriority(projectId, dto, user);
  }

  @Patch(':id/priorities/:priorityId')
  updateProjectPriority(
    @Param('id') projectId: string,
    @Param('priorityId') priorityId: string,
    @Body() dto: UpdateProjectPriorityRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; order: number; color: string | null }> {
    return this.projectsService.updateProjectPriority(projectId, priorityId, dto, user);
  }

  @Delete(':id/priorities/:priorityId')
  deleteProjectPriority(
    @Param('id') projectId: string,
    @Param('priorityId') priorityId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.projectsService.deleteProjectPriority(projectId, priorityId, user);
  }
}
