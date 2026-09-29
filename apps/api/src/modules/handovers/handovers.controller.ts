import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateHandoverDto } from './dto/create-handover.dto.js';
import { ReassignHandoverDto } from './dto/reassign-handover.dto.js';
import { HandoversService } from './handovers.service.js';
import { ReviewTasksService } from '../review-tasks/review-tasks.service.js';

@ApiTags('Handovers')
@Controller('tasks/:taskId/handover')
export class ReviewerHandoversController {
  constructor(private readonly tasks: ReviewTasksService) {}

  @Post()
  @Roles('REVIEWER')
  @ApiCreatedResponse()
  create(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.handover(taskId, dto, actor);
  }
}

@ApiTags('Handovers')
@Controller('handovers')
@Roles('ADMIN')
export class AdminHandoversController {
  constructor(private readonly handovers: HandoversService) {}

  @Get()
  @ApiOkResponse()
  findAll() {
    return this.handovers.findAll();
  }

  @Post(':handoverId/reassign')
  @ApiOkResponse()
  reassign(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Body() dto: ReassignHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.handovers.reassign(handoverId, dto, actor);
  }
}
