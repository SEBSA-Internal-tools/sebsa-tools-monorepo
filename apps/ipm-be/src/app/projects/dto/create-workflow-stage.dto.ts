import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, MinLength } from 'class-validator';

export class CreateWorkflowStageDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({
    description: 'Order/position of the stage. If omitted, will be auto-calculated as the next position.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  order?: number;
}
