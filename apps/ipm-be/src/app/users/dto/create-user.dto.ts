import { SystemRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsUUID()
  departmentId!: string;

  @IsEnum(SystemRole)
  systemRole!: SystemRole;
}
