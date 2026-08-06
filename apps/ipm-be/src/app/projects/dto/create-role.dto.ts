import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  privilegeGroupId!: string;
}
