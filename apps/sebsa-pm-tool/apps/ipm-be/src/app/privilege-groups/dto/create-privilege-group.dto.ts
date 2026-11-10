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

  /** Master deny — refuses every write regardless of the grants below. */
  @ApiProperty()
  @IsBoolean()
  isReadOnly!: boolean;

  @ApiProperty()
  @IsBoolean()
  canCreateCase!: boolean;

  @ApiProperty()
  @IsBoolean()
  canEditCase!: boolean;

  @ApiProperty()
  @IsBoolean()
  canDeleteCase!: boolean;

  @ApiProperty({ description: 'Covers subtasks as well as tasks.' })
  @IsBoolean()
  canCreateTask!: boolean;

  @ApiProperty({ description: 'Covers subtasks as well as tasks.' })
  @IsBoolean()
  canEditTask!: boolean;

  @ApiProperty({ description: 'Covers subtasks as well as tasks.' })
  @IsBoolean()
  canDeleteTask!: boolean;

  @ApiProperty()
  @IsBoolean()
  canComment!: boolean;

  @ApiProperty()
  @IsBoolean()
  canManageMembers!: boolean;

  @ApiProperty()
  @IsBoolean()
  canManageSprints!: boolean;

  @ApiProperty()
  @IsBoolean()
  canManageLabels!: boolean;

  @ApiProperty()
  @IsBoolean()
  canConfigureIntegrations!: boolean;
}
