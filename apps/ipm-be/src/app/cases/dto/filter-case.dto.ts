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
import { TaskCategory, CaseType, CaseStatus } from '@prisma/client';

export type CaseSortField = 'title' | 'priority' | 'type' | 'createdAt' | 'updatedAt' | 'dueDate' | 'storyPoints';

export class FilterCaseDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: CaseStatus })
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

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

  @ApiPropertyOptional({ format: 'uuid', description: "Matches against the project's customerId." })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filters to CSO-labeled cases when true.' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isCsoLabeled?: boolean;

  @ApiPropertyOptional({ enum: TaskCategory, description: 'Filters to the Functional or Technical queue.' })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({ enum: CaseType })
  @IsOptional()
  @IsEnum(CaseType)
  type?: CaseType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  priorityId?: string;

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
    enum: ['title', 'priority', 'type', 'createdAt', 'updatedAt', 'dueDate', 'storyPoints'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['title', 'priority', 'type', 'createdAt', 'updatedAt', 'dueDate', 'storyPoints'])
  sortBy: CaseSortField = 'createdAt';

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
