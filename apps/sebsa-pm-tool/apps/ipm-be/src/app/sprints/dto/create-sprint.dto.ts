import { IsNotEmpty, IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSprintDto {
  @ApiProperty({ example: 'Sprint 1' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'Complete core features', required: false })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiProperty({ example: '2026-08-15T00:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-08-29T00:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}
