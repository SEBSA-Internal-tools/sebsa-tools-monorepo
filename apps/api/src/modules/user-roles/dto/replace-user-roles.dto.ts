import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsIn } from 'class-validator';
import { ROLE_CODES, type RoleCode } from '../../auth/auth.constants.js';

export class ReplaceUserRolesDto {
  @ApiProperty({ enum: ROLE_CODES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(ROLE_CODES, { each: true })
  roles!: RoleCode[];
}

