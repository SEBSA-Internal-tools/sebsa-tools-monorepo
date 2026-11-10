import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCategory } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CloneCaseDto {
  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 300,
    description: 'Title for the copy. Defaults to the original case\'s title.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Project to place the copy in. Defaults to the original case\'s project.',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Also copy the case\'s tasks (reset to To Do, with assignees and labels).',
  })
  @IsOptional()
  @IsBoolean()
  includeTasks?: boolean;

  @ApiPropertyOptional({
    enum: TaskCategory,
    description:
      'Functional/Technical tag for the copy. Needed when the target is a CSO project and the original has none.',
  })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;
}
