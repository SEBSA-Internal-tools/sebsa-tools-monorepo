import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePrivilegeGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  canCreateTask?: boolean;

  @IsOptional()
  @IsBoolean()
  canDeleteTask?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageMembers?: boolean;

  @IsOptional()
  @IsBoolean()
  canConfigureIntegrations?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageWorkflow?: boolean;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;
}
