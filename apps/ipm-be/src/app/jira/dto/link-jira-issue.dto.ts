import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** Jira issue keys look like ABC-123. Validating the shape here keeps a typo
 * from becoming an outbound API call. */
export class LinkJiraIssueDto {
  @ApiProperty({ description: 'The Jira issue key to link, e.g. "AASL-42".', example: 'AASL-42' })
  @Matches(/^[A-Z][A-Z0-9]+-\d+$/, {
    message: 'issueKey must look like a Jira issue key, e.g. "AASL-42".',
  })
  issueKey!: string;
}
