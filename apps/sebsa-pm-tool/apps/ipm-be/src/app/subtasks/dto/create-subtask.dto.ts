import { SubtaskStatus } from '@prisma/client';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSubtaskDto {
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

  @ApiPropertyOptional({ enum: SubtaskStatus, default: SubtaskStatus.TO_DO })
  @IsOptional()
  @IsEnum(SubtaskStatus)
  status?: SubtaskStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      "Optional, free-text, manually-entered status label mirroring whatever a customer's own Jira board calls this item. No live sync.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jiraStatusLabel?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subtaskTypeId?: string;
}
