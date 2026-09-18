import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsHexColor,
  IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConfigKind, ConfigScope } from '@prisma/client';

export const CONFIG_LABEL_MAX_LENGTH = 60;

export class FilterConfigOptionsDto {
  @ApiPropertyOptional({ enum: ConfigScope, description: 'Defaults to GLOBAL.' })
  @IsOptional()
  @IsEnum(ConfigScope)
  scope?: ConfigScope;

  @ApiPropertyOptional({ enum: ConfigKind, description: 'Omit to return every list.' })
  @IsOptional()
  @IsEnum(ConfigKind)
  kind?: ConfigKind;

  @ApiPropertyOptional({ description: 'Include deactivated entries. Defaults to false.' })
  @IsOptional()
  @IsString()
  includeInactive?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Children of this entry, e.g. complexity levels under a task type.' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateConfigOptionDto {
  @ApiProperty({ enum: ConfigKind })
  @IsEnum(ConfigKind)
  kind!: ConfigKind;

  @ApiProperty({ enum: ConfigScope })
  @IsEnum(ConfigScope)
  scope!: ConfigScope;

  @ApiProperty({ maxLength: CONFIG_LABEL_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONFIG_LABEL_MAX_LENGTH)
  label!: string;

  @ApiPropertyOptional({ description: 'Hex colour, e.g. #3B82F6.' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Nests this entry under another, e.g. a complexity level under a task type.' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Counts as finished work in rollups.' })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ description: 'Counts as abandoned work in rollups.' })
  @IsOptional()
  @IsBoolean()
  isCancelled?: boolean;
}

export class UpdateConfigOptionDto {
  @ApiPropertyOptional({ maxLength: CONFIG_LABEL_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CONFIG_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCancelled?: boolean;
}

export class ReorderConfigOptionsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  orderedIds!: string[];
}
