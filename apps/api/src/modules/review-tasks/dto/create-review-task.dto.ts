import { ChecklistAnswerValue, TaskPriority } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChecklistAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId!: string;

  @ApiProperty({ enum: ChecklistAnswerValue })
  @IsEnum(ChecklistAnswerValue)
  answer!: ChecklistAnswerValue;
}

export class CreateReviewTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: 'CRIM-12345' })
  @IsString()
  @Matches(/\S/, { message: 'crimId must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(100)
  crimId!: string;

  @ApiPropertyOptional({ example: '24R2' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  version?: string | null;

  @ApiProperty({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @ApiProperty({ type: [Number], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  taskTypeIds!: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalRemarks?: string | null;

  @ApiProperty({ type: [ChecklistAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistAnswerDto)
  checklistAnswers!: ChecklistAnswerDto[];
}

