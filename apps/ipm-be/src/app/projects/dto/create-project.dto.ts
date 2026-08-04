import { ProjectType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ProjectType)
  type!: ProjectType;

  @ValidateIf((dto: CreateProjectDto) => dto.type === ProjectType.CUSTOM)
  @IsString()
  @MinLength(1)
  customType?: string;

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
