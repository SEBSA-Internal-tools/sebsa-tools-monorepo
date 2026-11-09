import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCategory, TaskStatus } from '@prisma/client';

export type TaskSortField = 'title' | 'priority' | 'createdAt' | 'updatedAt' | 'dueDate' | 'storyPoints';

export class FilterTaskDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  caseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filters to tasks within this project (across all its cases).' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  labelId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "Matches against the parent Case's project.customerId." })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  priorityId?: string;

  @ApiPropertyOptional({ enum: TaskCategory, description: 'Functional/Technical CSO queue.' })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({ description: 'Filters to tasks whose parent Case is CSO-labeled when true.' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isCsoLabeled?: boolean;

  @ApiPropertyOptional({
    description:
      'Filters to tasks with no assignee when true. Used by the CSO queue: a task drops out of the queue the moment someone is assigned to it.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  unassigned?: boolean;

  @ApiPropertyOptional({ description: 'Matches against title or description.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueAfter?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    enum: ['title', 'priority', 'createdAt', 'updatedAt', 'dueDate', 'storyPoints'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['title', 'priority', 'createdAt', 'updatedAt', 'dueDate', 'storyPoints'])
  sortBy: TaskSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeDeleted = false;
}
