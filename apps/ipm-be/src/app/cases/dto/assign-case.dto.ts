import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class CaseAssigneesDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 1, description: 'A case has at most one owner.' })
  @IsArray()
  @ArrayMaxSize(1, { message: 'A case can only have one case owner.' })
  @IsUUID('4', { each: true })
  assigneeIds!: string[];
}
