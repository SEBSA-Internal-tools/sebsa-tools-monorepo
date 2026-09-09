import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Caps an individual comment. Long enough for a real discussion, short enough
 * that a single request can't be used to bloat the table. */
export const COMMENT_MAX_LENGTH = 5000;
export const COMMENT_MAX_MENTIONS = 25;

export class CreateCommentDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Set exactly one of caseId or taskId.' })
  @IsOptional()
  @IsUUID()
  caseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Set exactly one of caseId or taskId.' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Makes this a reply to an existing comment.' })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string;

  @ApiProperty({ maxLength: COMMENT_MAX_LENGTH, description: 'Plain text. Stored and returned unmodified.' })
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
