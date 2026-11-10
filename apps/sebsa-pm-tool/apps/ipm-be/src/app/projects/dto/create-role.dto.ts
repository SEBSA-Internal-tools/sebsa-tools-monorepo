import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  privilegeGroupId!: string;
}
