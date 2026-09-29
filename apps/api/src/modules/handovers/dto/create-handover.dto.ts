import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateHandoverDto {
  @ApiProperty({ example: 'I am unavailable and cannot complete this review.' })
  @IsString()
  @Matches(/\S/, { message: 'reason must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
