import { DependencyType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

export class CreateTaskDependencyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetTaskId!: string;

  @ApiProperty({ enum: DependencyType, description: 'BLOCKED_BY is derived, not storable — see TaskDependency in schema.prisma.' })
  @IsEnum(DependencyType)
  type!: DependencyType;
}
