import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CommentSummary } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { FilterCommentDto } from './dto/filter-comment.dto';

/**
 * Comment threads on a case or a task. Every route resolves the owning project
 * and applies the same visibility rule as the entity itself.
 */
@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'Comment thread for one case or task, oldest first.' })
  async findAll(
    @Query() filter: FilterCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CommentSummary[]> {
    return this.comments.findAll(filter, user);
  }

  @Post()
  @ApiOperation({ summary: 'Post a comment, or a reply when parentCommentId is set.' })
  async create(
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CommentSummary> {
    return this.comments.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a comment. Authors only, or an admin.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CommentSummary> {
    return this.comments.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a comment. Authors only, or an admin.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    return this.comments.remove(id, user);
  }
}
