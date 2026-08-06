import { IsArray, IsUUID } from 'class-validator';

export class AssigneesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds!: string[];
}
