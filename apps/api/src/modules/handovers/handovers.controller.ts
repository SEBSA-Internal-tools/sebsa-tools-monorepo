import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateHandoverDto } from './dto/create-handover.dto.js';
import { ReassignHandoverDto } from './dto/reassign-handover.dto.js';
import { HandoversService } from './handovers.service.js';
import { ReviewTasksService } from '../review-tasks/review-tasks.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';

@ApiTags('Handovers')
@Controller('tasks/:taskId/handover')
export class ReviewerHandoversController {
  constructor(
    private readonly tasks: ReviewTasksService,
    private readonly reviews: ReviewsService,
  ) {}

  @Post()
  @Roles('REVIEWER')
  @ApiCreatedResponse()
  async create(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (dto.draft) await this.reviews.saveDraft(taskId, dto.draft, actor);
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

  @Get(':handoverId')
  @ApiOkResponse()
  findOne(@Param('handoverId', ParseUUIDPipe) handoverId: string) {
    return this.handovers.findOne(handoverId);
  }

  @Get(':handoverId/draft')
  @ApiOkResponse()
  findDraft(@Param('handoverId', ParseUUIDPipe) handoverId: string) {
    return this.handovers.findDraft(handoverId);
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

  @Post(':handoverId/return')
  @ApiOkResponse()
  returnToQueue(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.handovers.returnToQueue(handoverId, actor);
  }
}
