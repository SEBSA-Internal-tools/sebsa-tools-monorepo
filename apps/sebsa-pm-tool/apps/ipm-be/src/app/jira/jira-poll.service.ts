import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { JiraClientService } from './jira-client.service';
import { JiraSyncService } from './jira-sync.service';

/** Safety net behind the webhook: catches anything a missed/misconfigured
 *  webhook delivery would otherwise drop. The 10-minute JQL window in
 *  pollAllLinkedProjects overlaps this 2-minute interval generously, so a
 *  slow tick or a brief Jira outage can't create a gap.
 *
 *  Off by default (JIRA_POLLING_ENABLED unset/false) — this reads every
 *  recently-changed issue in the linked Jira project indiscriminately,
 *  which for a live/production Jira project means real, unrelated data
 *  the moment it's turned on. Only enable once that's explicitly wanted. */
@Injectable()
export class JiraPollService {
  private readonly logger = new Logger(JiraPollService.name);

  constructor(
    private readonly jira: JiraClientService,
    private readonly jiraSync: JiraSyncService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/2 * * * *')
  async poll(): Promise<void> {
    if (!this.jira.isConfigured()) return;
    if (this.config.get<string>('jira.pollingEnabled') !== 'true') return;
    try {
      await this.jiraSync.pollAllLinkedProjects();
    } catch (err) {
      this.logger.error(`Jira poll cycle failed: ${(err as Error).message}`);
    }
  }
}
