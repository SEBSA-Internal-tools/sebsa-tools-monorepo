import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Hiruni Wijethilaka' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
