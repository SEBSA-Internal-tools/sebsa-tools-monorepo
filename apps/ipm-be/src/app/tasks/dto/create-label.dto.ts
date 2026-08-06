import { IsHexColor, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateLabelDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @IsHexColor()
  color?: string;
}