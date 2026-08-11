import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SprintStatus } from '@sebsa-pm-tool/shared-models';

export class UpdateSprintDto {
  @ApiProperty({ example: 'Sprint 1 Updated', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'Complete core features', required: false })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiProperty({ example: '2026-08-15T00:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ example: '2026-08-29T00:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ enum: ['PLANNED', 'ACTIVE', 'COMPLETED'], required: false })
  @IsOptional()
  @IsEnum(['PLANNED', 'ACTIVE', 'COMPLETED'])
  status?: SprintStatus;
}
