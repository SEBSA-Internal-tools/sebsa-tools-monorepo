import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LinkJiraProjectDto {
  @ApiProperty({ description: 'The Jira project key to sync, e.g. "AASL".' })
  @IsString()
  @MinLength(1)
  jiraProjectKey!: string;
}
