import { TaskType, Priority } from '@prisma/client';
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
 @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsUUID()
  workflowStageId!: string;

  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  storyPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminderLeadMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds?: string[];
}

