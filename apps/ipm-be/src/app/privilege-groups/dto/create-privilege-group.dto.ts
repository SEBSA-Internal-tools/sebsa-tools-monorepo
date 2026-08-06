import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePrivilegeGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsBoolean()
  canCreateTask!: boolean;

  @IsBoolean()
  canDeleteTask!: boolean;

  @IsBoolean()
  canManageMembers!: boolean;

  @IsBoolean()
  canConfigureIntegrations!: boolean;

  @IsBoolean()
  canManageWorkflow!: boolean;

  @IsBoolean()
  isReadOnly!: boolean;
}
