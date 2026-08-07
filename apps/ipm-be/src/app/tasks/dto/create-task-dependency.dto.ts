import { DependencyType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class CreateTaskDependencyDto {
  @IsUUID()
  targetTaskId!: string;

  @IsEnum(DependencyType)
  type!: DependencyType;
}
