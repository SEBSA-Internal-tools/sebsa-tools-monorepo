import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CreateReviewTaskDto } from './dto/create-review-task.dto.js';
import { UpdateReviewTaskDto } from './dto/update-review-task.dto.js';
import { ReviewTasksService } from './review-tasks.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewTaskQueryDto } from './dto/review-task-query.dto.js';
import { NextTaskVersionQueryDto } from './dto/next-task-version-query.dto.js';
import { AssignReviewerDto } from './dto/assign-reviewer.dto.js';

@ApiTags('Review Tasks')
@Controller(['review-tasks', 'tasks'])
export class ReviewTasksController {
  constructor(private readonly tasks: ReviewTasksService) {}
  @Get() @ApiOkResponse() findAll(
    @Query() query: ReviewTaskQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.findAll(user, query.scope ?? 'mine');
  }
  @Get('next-version') @Roles('DEVELOPER', 'ADMIN') @ApiOkResponse() nextVersion(
    @Query() query: NextTaskVersionQueryDto,
  ) {
    return this.tasks.nextVersion(query.customerId, query.crimId);
  }
  @Get(':id/checklist') @ApiOkResponse() @ApiNoContentResponse() async findChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const checklist = await this.tasks.findChecklist(id, user);
    if (checklist === null) response.status(HttpStatus.NO_CONTENT);
    return checklist ?? undefined;
  }
  @Put(':id/checklist') @Roles('DEVELOPER') @ApiOkResponse() saveChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.saveChecklist(id, body, user);
  }
  @Get(':id/checklist-submissions') @ApiOkResponse() findChecklistSubmissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.findChecklistSubmissions(id, user);
  }
  @Get(':id/events') @ApiOkResponse() findEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.findEvents(id, user);
  }
  @Get(':id/attachments') @ApiOkResponse() findAttachments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.findAttachments(id, user);
  }
  @Post(':id/attachments') @Roles('DEVELOPER') @ApiOkResponse() addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.addAttachment(id, body, user);
  }
  @Patch(':id/attachments/:attachmentId') @Roles('DEVELOPER') @ApiOkResponse() captionAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.captionAttachment(id, attachmentId, body, user);
  }
  @Delete(':id/attachments/:attachmentId') @Roles('DEVELOPER') @ApiOkResponse() removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.removeAttachment(id, attachmentId, user);
  }
  @Get(':id') @ApiOkResponse() findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.findOne(id, user);
  }
  @Post() @Roles('DEVELOPER', 'ADMIN') @ApiCreatedResponse() create(
    @Body() dto: CreateReviewTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.create(dto, user);
  }
  @Patch(':id') @Roles('DEVELOPER', 'ADMIN') @ApiOkResponse() update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.update(id, dto, user);
  }
  @Post(':id/submit') @Roles('DEVELOPER', 'ADMIN') @ApiOkResponse() submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.submit(id, user);
  }
  @Post(':id/pick') @Roles('REVIEWER') @ApiOkResponse() pick(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.pick(id, user);
  }
  @Post(':id/assign') @Roles('ADMIN') @ApiOkResponse() assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.assign(id, dto.reviewerId, user);
  }
  @Delete(':id')
  @Roles('DEVELOPER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.tasks.remove(id, user);
  }
}

@ApiTags('Task Identities')
@Controller('task-identities')
export class TaskIdentitiesController {
  constructor(private readonly tasks: ReviewTasksService) {}

  @Get('next-version')
  @Roles('DEVELOPER', 'ADMIN')
  @ApiOkResponse()
  nextVersion(@Query() query: NextTaskVersionQueryDto) {
    return this.tasks.nextVersion(query.customerId, query.crimId);
  }
}
