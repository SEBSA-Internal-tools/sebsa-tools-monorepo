import { CaseType, CaseStatus, TaskCategory } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export class CreateCaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

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

  @ApiProperty({ enum: CaseType })
  @IsEnum(CaseType)
  type!: CaseType;

  @ApiPropertyOptional({ enum: CaseStatus, default: CaseStatus.TO_DO })
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  priorityId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

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

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 1,
    description: 'A case has at most one owner.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1, { message: 'A case can only have one case owner.' })
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Ignored — derived server-side from the target project\'s own CSO flag. A case is CSO-labeled if and only if its project is.',
  })
  @IsOptional()
  @IsBoolean()
  isCsoLabeled?: boolean;

  @ApiPropertyOptional({
    enum: TaskCategory,
    description: 'Functional/Technical tag. Required when isCsoLabeled is true.',
  })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      "Optional, free-text, manually-entered status label mirroring whatever a customer's own Jira board calls this item. No live sync.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jiraStatusLabel?: string;
}
