import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePrivilegeGroupDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsBoolean()
  canCreateTask!: boolean;

  @ApiProperty()
  @IsBoolean()
  canDeleteTask!: boolean;

  @ApiProperty()
  @IsBoolean()
  canManageMembers!: boolean;

  @ApiProperty()
  @IsBoolean()
  canConfigureIntegrations!: boolean;

  @ApiProperty()
  @IsBoolean()
  canManageWorkflow!: boolean;

  @ApiProperty()
  @IsBoolean()
  isReadOnly!: boolean;
}
