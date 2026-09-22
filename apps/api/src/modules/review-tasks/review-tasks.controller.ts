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

@ApiTags('Review Tasks')
@Controller('review-tasks')
export class ReviewTasksController {
  constructor(private readonly tasks: ReviewTasksService) {}
  @Get() @ApiOkResponse() findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.findAll(user);
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
  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tasks.remove(id);
  }
}

