import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class NextTaskVersionQueryDto {
  @ApiProperty({ example: 'CRIM-12345' })
  @IsString()
  @Matches(/\S/, { message: 'crimId must contain a non-whitespace character' })
  @MinLength(1)
  @MaxLength(100)
  crimId!: string;
}
