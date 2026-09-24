import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTaskTypeDto {
  @ApiProperty({ example: 'CUSTOMIZATION' })
  @IsString()
  @Matches(/\S/, { message: 'code must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Customization' })
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

