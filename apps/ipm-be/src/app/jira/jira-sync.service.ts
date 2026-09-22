import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { JiraClientService, JiraIssue } from './jira-client.service';

interface JiraIntegrationConfig {
  jiraProjectKey: string;
}

/** Jira Cloud's v3 API returns `description` as Atlassian Document Format.
 *  We only need the plain text out of it. */
function fromADF(adf: unknown): string {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;

  const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
  return (doc.content ?? [])
    .map((block) => (block.content ?? []).map((node) => node.text ?? '').join(''))
    .join('\n')
    .trim();
}

/**
 * One-way Jira integration: changes flow from Jira into this application and
 * never the other way.
 *
 * A Jira issue is attached to a Case explicitly — nothing is created from Jira
 * automatically, so a linked project's board does not fill up with unrelated
 * issues. Only two fields come across, and both are stored separately from the
 * case's own: `jiraStatusLabel` sits beside our status rather than replacing it
 * (a Jira workflow rarely matches ours), and `jiraDescription` sits beside our
 * description so a pull never overwrites what someone wrote here.
 */
@Injectable()
export class JiraSyncService {
  private readonly logger = new Logger(JiraSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jira: JiraClientService,
  ) {}

  // ---------------------------------------------------------------------------
  // Project linking
  // ---------------------------------------------------------------------------

  /** Points a project at a Jira project so issues from it can be linked to its
   *  cases. Safe to re-run — re-linking just replaces the stored key. */
  async linkProject(projectId: string, jiraProjectKey: string): Promise<void> {
    if (!this.jira.isConfigured()) {
      throw new BadRequestException('Jira integration is not configured on this server.');
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found.');

    // Verified now rather than silently returning nothing on every poll. A
    // mistyped key is the likely failure, so it gets a message that says so
    // instead of an unhandled Jira error.
    try {
      await this.jira.getProjectIssueTypes(jiraProjectKey);
    } catch {
      throw new BadRequestException(
        `No Jira project "${jiraProjectKey}" is visible with the configured credentials. Check the key and try again.`,
      );
    }

    await this.prisma.integration.upsert({
      where: { projectId_type: { projectId, type: 'JIRA' } },
      create: {
        projectId,
        type: 'JIRA',
        isEnabled: true,
        config: { jiraProjectKey } satisfies JiraIntegrationConfig,
      },
      update: { isEnabled: true, config: { jiraProjectKey } satisfies JiraIntegrationConfig },
    });

    this.logger.log(`Linked project ${projectId} to Jira project ${jiraProjectKey}.`);
  }

  /** What a project is currently linked to, if anything. */
  async getProjectLink(projectId: string): Promise<{ jiraProjectKey: string; linkedCaseCount: number } | null> {
    const integration = await this.getLinkedIntegration(projectId);
    if (!integration) return null;

    const { jiraProjectKey } = integration.config as unknown as JiraIntegrationConfig;
    const linkedCaseCount = await this.prisma.case.count({
      where: { projectId, deletedAt: null, jiraIssueKey: { not: null } },
    });

    return { jiraProjectKey, linkedCaseCount };
  }

  /** Disables the project's integration. Cases keep whatever they last pulled
   *  — clearing them would silently wipe data a user can see, so unlinking a
   *  case stays an explicit, per-case action. */
  async unlinkProject(projectId: string): Promise<void> {
    await this.prisma.integration.updateMany({
      where: { projectId, type: 'JIRA' },
      data: { isEnabled: false },
    });
    this.logger.log(`Unlinked project ${projectId} from Jira.`);
  }

  // ---------------------------------------------------------------------------
  // Case <-> issue linking
  // ---------------------------------------------------------------------------

  /** Attaches a Jira issue to a case and pulls its current state immediately,
   *  so the case shows the issue's status without waiting for a poll. */
  async linkCase(caseId: string, issueKey: string): Promise<void> {
    if (!this.jira.isConfigured()) {
      throw new BadRequestException('Jira integration is not configured on this server.');
    }

    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (!kase) throw new NotFoundException('Case not found.');

    const integration = await this.getLinkedIntegration(kase.projectId);
    if (!integration) {
      throw new BadRequestException('This case\'s project is not linked to a Jira project.');
    }

    const claimedBy = await this.prisma.case.findUnique({
      where: { jiraIssueKey: issueKey },
      select: { id: true },
    });
    if (claimedBy && claimedBy.id !== caseId) {
      throw new BadRequestException(`Jira issue ${issueKey} is already linked to another case.`);
    }

    // Verifies the issue exists and belongs to the linked project before storing.
    const issue = await this.jira.getIssue(issueKey);
    const { jiraProjectKey } = integration.config as unknown as JiraIntegrationConfig;
    const issueProjectKey = (issue as unknown as { fields: { project?: { key: string } } })
      .fields.project?.key;

    if (issueProjectKey && issueProjectKey !== jiraProjectKey) {
      throw new BadRequestException(
        `Jira issue ${issueKey} belongs to project ${issueProjectKey}, not ${jiraProjectKey}.`,
      );
    }

    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        jiraIssueKey: issueKey,
        jiraStatusLabel: issue.fields.status.name,
        jiraDescription: fromADF(issue.fields.description),
        jiraSyncedAt: new Date(issue.fields.updated),
      },
    });

    this.logger.log(`Linked case ${caseId} to Jira issue ${issueKey}.`);
  }

  /** Detaches the issue and clears what came from it, leaving the case's own
   *  fields untouched. */
  async unlinkCase(caseId: string): Promise<void> {
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, deletedAt: null },
      select: { id: true },
    });
    if (!kase) throw new NotFoundException('Case not found.');

    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        jiraIssueKey: null,
        jiraStatusLabel: null,
        jiraDescription: null,
        jiraSyncedAt: null,
      },
    });

    this.logger.log(`Unlinked case ${caseId} from Jira.`);
  }

  // ---------------------------------------------------------------------------
  // Incoming: Jira issue change -> linked case
  // ---------------------------------------------------------------------------

  /** Updates the case an issue is linked to. An issue nobody has linked is
   *  ignored — linking is deliberate, so an unknown key is not an error. */
  async pullIssueIntoCase(issue: JiraIssue): Promise<void> {
    const existing = await this.prisma.case.findUnique({
      where: { jiraIssueKey: issue.key },
      select: { id: true, jiraSyncedAt: true },
    });
    if (!existing) return;

    // A repeated webhook or an overlapping poll window replays the same change;
    // the recorded Jira timestamp is what tells them apart.
    const updatedAt = new Date(issue.fields.updated);
    if (existing.jiraSyncedAt && existing.jiraSyncedAt >= updatedAt) return;

    await this.prisma.case.update({
      where: { id: existing.id },
      data: {
        jiraStatusLabel: issue.fields.status.name,
        jiraDescription: fromADF(issue.fields.description),
        jiraSyncedAt: updatedAt,
      },
    });

    this.logger.log(`Updated case ${existing.id} from Jira issue ${issue.key}.`);
  }

  // ---------------------------------------------------------------------------
  // Entry points
  // ---------------------------------------------------------------------------

  async handleWebhookIssue(issue: JiraIssue): Promise<void> {
    await this.pullIssueIntoCase(issue);
  }

  /** Polling safety net behind the webhook. The JQL window is wider than the
   *  poll interval so a slow tick cannot leave a gap. */
  async pollAllLinkedProjects(): Promise<void> {
    const integrations = await this.getAllActiveIntegrations();

    for (const integration of integrations) {
      const { jiraProjectKey } = integration.config as unknown as JiraIntegrationConfig;
      try {
        const issues = await this.jira.searchIssues(
          `project = "${jiraProjectKey}" AND updated >= "-10m"`,
        );
        for (const issue of issues) {
          await this.pullIssueIntoCase(issue);
        }
      } catch (err) {
        this.logger.error(
          `Polling failed for Jira project ${jiraProjectKey}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  async getAllActiveIntegrations() {
    return this.prisma.integration.findMany({
      where: { type: 'JIRA', isEnabled: true },
    });
  }

  private async getLinkedIntegration(projectId: string) {
    return this.prisma.integration.findFirst({
      where: { projectId, type: 'JIRA', isEnabled: true },
    });
  }
}
