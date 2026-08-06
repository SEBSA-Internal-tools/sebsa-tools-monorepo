import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { TaskService } from './task.service'; 
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 
import { CurrentUser } from '../auth/current-user.decorator';
import { FilterTaskDto } from './dto/filter-task.dto';
import { AssigneesDto } from './dto/assign-task.dto';
import { TaskLabelsDto } from './dto/task-label.dto';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.create(dto, user);
  }

  @Get()
  async findAll(
    @Query() filter: FilterTaskDto,
  ) {
    return this.taskService.findAll(filter);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.update(id, dto, user);
  }

  @Delete(':id')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.delete(id, user);
  }

  // --- Task Assignment Endpoints ---

  @Post(':id/assignees')
  async assignUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssigneesDto,
  ) {
    return this.taskService.assignUsers(id, dto.assigneeIds);
  }

  @Delete(':id/assignees/:userId')
  async unassignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.taskService.unassignUser(id, userId);
  }

  @Get(':id/assignees')
  async getAssignees(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskService.getAssignees(id);
  }

  // --- Task Label Endpoints ---

  @Post(':id/labels')
  async attachLabels(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskLabelsDto,
  ) {
    return this.taskService.attachLabels(id, dto.labelIds);
  }

  @Delete(':id/labels/:labelId')
  async detachLabel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ) {
    return this.taskService.detachLabel(id, labelId);
  }

  // --- Subtask Endpoints ---

  @Get(':id/subtasks')
  async getSubtasks(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskService.getSubtasks(id);
  }

  @Post(':id/subtasks')
  async createSubtask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.createSubtask(id, dto, user);
  }
}
