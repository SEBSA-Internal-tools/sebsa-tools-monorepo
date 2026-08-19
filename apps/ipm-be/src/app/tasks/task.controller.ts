import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FilterTaskDto } from './dto/filter-task.dto';
import { AssigneesDto } from './dto/assign-task.dto';
import { TaskLabelsDto } from './dto/task-label.dto';
import { CreateTaskDependencyDto } from './dto/create-task-dependency.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.taskService.create(dto, user);
  }

  @Get()
  async findAll(@Query() filter: FilterTaskDto, @CurrentUser() user: AuthUser) {
    return this.taskService.findAll(filter, user);
  }

  @Get('my-assigned')
  async getMyAssignedTasks(@CurrentUser() user: AuthUser) {
    return this.taskService.getMyAssignedTasks(user);
  }

  @Get('list')
  async getTaskList(@Query() filter: FilterTaskDto, @CurrentUser() user: AuthUser) {
    return this.taskService.getTaskList(filter, user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taskService.findOne(id, user);
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
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taskService.delete(id, user);
  }

  // --- Task Assignment Endpoints ---

  @Post(':id/assignees')
  async assignUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssigneesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.assignUsers(id, dto.assigneeIds, user);
  }

  @Delete(':id/assignees/:userId')
  async unassignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.unassignUser(id, userId, user);
  }

  @Get(':id/assignees')
  async getAssignees(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taskService.getAssignees(id, user);
  }

  // --- Task Label Endpoints ---

  @Post(':id/labels')
  async attachLabels(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskLabelsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.attachLabels(id, dto.labelIds, user);
  }

  @Delete(':id/labels/:labelId')
  async detachLabel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.detachLabel(id, labelId, user);
  }

  // --- Subtask Endpoints ---

  @Get(':id/subtasks')
  async getSubtasks(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taskService.getSubtasks(id, user);
  }

  @Post(':id/subtasks')
  async createSubtask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSubtaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.createSubtask(id, dto, user);
  }

  // --- Dependency Endpoints (FSD §5.5) ---

  @Get(':id/dependencies')
  async getDependencies(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taskService.getDependencies(id, user);
  }

  @Post(':id/dependencies')
  async createDependency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskDependencyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.createDependency(id, dto, user);
  }

  @Delete(':id/dependencies/:dependencyId')
  async removeDependency(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dependencyId', ParseUUIDPipe) dependencyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taskService.removeDependency(id, dependencyId, user);
  }

  // --- Status History (feeds the Status/Flow Stepper) ---

  @Get(':id/status-history')
  async getStatusHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taskService.getStatusHistory(id, user);
  }

  // --- Category/Assignment History (Functional/Technical conversion trail) ---

  @Get(':id/category-history')
  async getCategoryHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taskService.getCategoryHistory(id, user);
  }
}
