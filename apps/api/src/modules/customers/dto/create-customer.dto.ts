import { CustomerStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiPropertyOptional({ example: 'IFS', description: 'Generated from the name when omitted' })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'code must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(50)
  code?: string;
  @ApiProperty({ example: 'IFS' })
  @IsString()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(255)
  name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsHexColor()
  color?: string;
  @ApiPropertyOptional({ enum: CustomerStatus, default: CustomerStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
