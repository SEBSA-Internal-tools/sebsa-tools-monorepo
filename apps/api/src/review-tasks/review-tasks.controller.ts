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
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateReviewTaskDto } from './dto/create-review-task.dto.js';
import { UpdateReviewTaskDto } from './dto/update-review-task.dto.js';
import { ReviewTasksService } from './review-tasks.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewTaskQueryDto } from './dto/review-task-query.dto.js';

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
    return this.tasks.create(dto, user.id);
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
  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tasks.remove(id);
  }
}
