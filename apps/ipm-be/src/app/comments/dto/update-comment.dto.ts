import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { COMMENT_MAX_LENGTH, COMMENT_MAX_MENTIONS } from './create-comment.dto';

export class UpdateCommentDto {
  @ApiProperty({ maxLength: COMMENT_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_MAX_LENGTH)
  body!: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: COMMENT_MAX_MENTIONS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMMENT_MAX_MENTIONS)
  @IsUUID(undefined, { each: true })
  mentionedUserIds?: string[];
}
