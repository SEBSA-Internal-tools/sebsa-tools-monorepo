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
}
