import { ProjectStatus, ProjectType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;

  @ValidateIf((dto: UpdateProjectDto) => dto.type === ProjectType.CUSTOM)
  @IsString()
  @MinLength(1)
  customType?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  targetEndDate?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
