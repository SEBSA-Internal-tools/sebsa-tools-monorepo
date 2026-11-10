import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubtaskService } from './subtask.service';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { SubtaskAssigneesDto } from './dto/assign-subtask.dto';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('subtasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SubtaskController {
  constructor(private readonly subtaskService: SubtaskService) {}

  @Get('tasks/:taskId/subtasks')
  async findAllByTask(@Param('taskId', ParseUUIDPipe) taskId: string, @CurrentUser() user: AuthUser) {
    return this.subtaskService.findAllByTask(taskId, user);
  }

  @Post('tasks/:taskId/subtasks')
  async create(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateSubtaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subtaskService.create(taskId, dto, user);
  }

  @Get('subtasks/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.subtaskService.findOne(id, user);
  }

  @Patch('subtasks/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubtaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subtaskService.update(id, dto, user);
  }

  @Delete('subtasks/:id')
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.subtaskService.delete(id, user);
  }

  @Post('subtasks/:id/assignees')
  async assignUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubtaskAssigneesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subtaskService.assignUsers(id, dto.assigneeIds, user);
  }

  @Delete('subtasks/:id/assignees/:userId')
  async unassignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subtaskService.unassignUser(id, userId, user);
  }
}
