import { TaskCategory, TaskStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ format: 'uuid', description: 'The Case this Task belongs to.' })
  @IsUUID()
  caseId!: string;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TO_DO })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  priorityId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  storyPoints?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Minutes before dueDate to send a reminder.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  reminderLeadMinutes?: number;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds?: string[];

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      "Optional, free-text, manually-entered status label mirroring whatever a customer's own Jira board calls this item. No live sync.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jiraStatusLabel?: string;

  @ApiPropertyOptional({
    enum: TaskCategory,
    description:
      'Functional/Technical tag — independent of the parent Case\'s own category. Required when the parent Case is CSO; routes the task into the Functional or Technical queue.',
  })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  taskTypeId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Must belong to taskTypeId\'s own complexity scale.' })
  @IsOptional()
  @IsUUID()
  complexityLevelId?: string;
}
