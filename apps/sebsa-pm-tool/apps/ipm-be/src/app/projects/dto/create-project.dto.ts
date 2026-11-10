import { ProjectType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProjectType })
  @IsEnum(ProjectType)
  type!: ProjectType;

  @ApiPropertyOptional({ description: 'Required when type is CUSTOM.' })
  @ValidateIf((dto: CreateProjectDto) => dto.type === ProjectType.CUSTOM)
  @IsString()
  @MinLength(1)
  customType?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  targetEndDate?: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ default: false, description: 'Flags this project as a CSO Project.' })
  @IsOptional()
  @IsBoolean()
  isCsoProject?: boolean;

  @ApiProperty({ format: 'uuid', description: 'Every project belongs to exactly one customer.' })
  @IsUUID()
  customerId!: string;
}
