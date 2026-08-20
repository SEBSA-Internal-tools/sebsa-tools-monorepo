import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderWorkflowStagesDto {
  @ApiProperty({
    type: [String],
    description: 'Every workflow stage ID for the project, in the desired new order.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  stageIds!: string[];
}
