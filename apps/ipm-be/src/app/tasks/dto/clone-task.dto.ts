import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CloneTaskDto {
  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 300,
    description: 'Title for the copy. Defaults to the original task\'s title.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Case to place the copy under (may be in another project). Defaults to the original task\'s case.',
  })
  @IsOptional()
  @IsUUID()
  caseId?: string;

  @ApiPropertyOptional({
    enum: TaskCategory,
    description:
      'Functional/Technical tag for the copy. Needed when the target case is CSO and the original has none.',
  })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;
}
