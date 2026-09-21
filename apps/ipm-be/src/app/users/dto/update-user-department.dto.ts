import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateUserDepartmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  departmentId!: string;
}
