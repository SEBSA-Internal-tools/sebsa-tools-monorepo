import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roleId!: string;
}
