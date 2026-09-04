import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateComplexityLevelDto {
  @ApiProperty({ minLength: 1, maxLength: 50, description: 'e.g. Basic, Low, Medium, High, Very High.' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ description: 'Color, e.g. #22c55e.' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'The level\'s position (1-5 typically). Defaults to last if omitted.' })
  @IsOptional()
  @IsInt()
  order?: number;
}
