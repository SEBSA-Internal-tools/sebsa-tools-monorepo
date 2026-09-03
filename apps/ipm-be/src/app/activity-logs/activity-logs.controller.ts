import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntityType } from '@prisma/client';
import { ActivityLogPage, AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ActivityLogsService } from './activity-logs.service';
import { QueryActivityLogsDto } from './dto/query-activity-logs.dto';

/**
 * Read-only activity feeds for a single work item. Each route resolves the
 * owning project and applies the same visibility rule as the entity itself, so
 * a feed never exposes activity from a project the caller cannot open.
 */
@ApiTags('activity-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private readonly activityLogs: ActivityLogsService) {}

  @Get('projects/:id')
  @ApiOperation({
    summary: 'Activity across a whole project, including all its cases, tasks and subtasks.',
  })
  async findForProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryActivityLogsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityLogPage> {
    return this.activityLogs.findForEntity(EntityType.PROJECT, id, user, query);
  }

  @Get('cases/:id')
  @ApiOperation({ summary: 'Activity on a case, including its tasks and their subtasks.' })
  async findForCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryActivityLogsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityLogPage> {
    return this.activityLogs.findForEntity(EntityType.CASE, id, user, query);
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Activity on a task, including its subtasks.' })
  async findForTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryActivityLogsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityLogPage> {
    return this.activityLogs.findForEntity(EntityType.TASK, id, user, query);
  }

  @Get('subtasks/:id')
  @ApiOperation({ summary: 'Activity on a single subtask.' })
  async findForSubtask(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryActivityLogsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ActivityLogPage> {
    return this.activityLogs.findForEntity(EntityType.SUBTASK, id, user, query);
  }
}
