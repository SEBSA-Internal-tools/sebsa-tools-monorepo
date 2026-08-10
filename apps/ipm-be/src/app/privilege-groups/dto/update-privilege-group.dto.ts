import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePrivilegeGroupDto {
  @ApiPropertyOptional({ minLength: 1 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canCreateTask?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canDeleteTask?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canManageMembers?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canConfigureIntegrations?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canManageWorkflow?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;
}
