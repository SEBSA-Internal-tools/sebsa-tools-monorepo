import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { JiraClientService, JiraIssue } from './jira-client.service';

interface JiraIntegrationConfig {
  jiraProjectKey: string;
  /** No universal "Task" type exists across Jira project types (Service
   *  Desk projects use request types like "Submit a request or incident"
   *  instead) — resolved once at link time from the project's actual
   *  available issue types and reused for every outgoing create. */
  defaultIssueTypeName: string;
}

/** Minimal Atlassian Document Format helpers — Jira Cloud's v3 API requires
 *  `description` as ADF, not plain text, and returns it the same way. We
 *  only ever need to round-trip plain text, not rich formatting. */
function toADF(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
}

function fromADF(adf: unknown): string {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
  return (doc.content ?? [])
    .map((block) => (block.content ?? []).map((node) => node.text ?? '').join(''))
    .join('\n')
    .trim();
}

@Injectable()
export class JiraSyncService {
  private readonly logger = new Logger(JiraSyncService.name);
  private syncActorIdCache: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jira: JiraClientService,
  ) {}

  // ---------------------------------------------------------------------------
  // Project linking / bootstrap
  // ---------------------------------------------------------------------------

  /** Links a SEBSA project to a Jira project, mirroring the Jira project's
   *  actual statuses and priorities in as matching workflow stages / project
   *  priorities — rather than force-fitting Jira's data onto whatever the
   *  SEBSA project already has. Safe to re-run: skips anything already
   *  present by name. */
  async linkProject(projectId: string, jiraProjectKey: string): Promise<void> {
    if (!this.jira.isConfigured()) {
      throw new BadRequestException('Jira integration is not configured on this server.');
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found.');

    const [jiraStatuses, jiraPriorities, issueTypes, existingStages, existingPriorities] = await Promise.all([
      this.jira.getProjectStatuses(jiraProjectKey),
      this.jira.getPriorities(),
      this.jira.getProjectIssueTypes(jiraProjectKey),
      this.prisma.workflowStage.findMany({ where: { projectId } }),
      this.prisma.projectPriority.findMany({ where: { projectId } }),
    ]);
    if (issueTypes.length === 0) {
      throw new BadRequestException(`Jira project ${jiraProjectKey} has no usable (non-subtask) issue types.`);
    }
    const defaultIssueTypeName = issueTypes[0].name;

    let nextStageOrder = existingStages.length
      ? Math.max(...existingStages.map((s) => s.order)) + 1
      : 0;
    for (const status of jiraStatuses) {
      if (existingStages.some((s) => s.name === status.name)) continue;
      await this.prisma.workflowStage.create({
        data: { projectId, name: status.name, order: nextStageOrder++, isDefault: nextStageOrder === 1 },
      });
    }

    let nextPriorityOrder = existingPriorities.length
      ? Math.max(...existingPriorities.map((p) => p.order)) + 1
      : 0;
    for (const priority of jiraPriorities) {
      if (existingPriorities.some((p) => p.name === priority.name)) continue;
      await this.prisma.projectPriority.create({
        data: { projectId, name: priority.name, order: nextPriorityOrder++ },
      });
    }

    const config = { jiraProjectKey, defaultIssueTypeName } satisfies JiraIntegrationConfig;
    const configJson = config as unknown as Prisma.InputJsonValue;
    await this.prisma.integration.upsert({
      where: { projectId_type: { projectId, type: 'JIRA' } },
      create: { projectId, type: 'JIRA', isEnabled: true, config: configJson },
      update: { isEnabled: true, config: configJson },
    });

    this.logger.log(`Linked project ${projectId} to Jira project ${jiraProjectKey}.`);
  }

  private async getLinkedIntegration(projectId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { projectId_type: { projectId, type: 'JIRA' } },
    });
    if (!integration?.isEnabled) return null;
    return integration;
  }

  async getAllActiveIntegrations() {
    return this.prisma.integration.findMany({ where: { type: 'JIRA', isEnabled: true } });
  }

  // ---------------------------------------------------------------------------
  // Outgoing: SEBSA task change -> Jira issue
  // ---------------------------------------------------------------------------

  /** Fire from the controller after a user-initiated create/update — never
   *  from inside pullIssueIntoTask, or an incoming Jira change would bounce
   *  straight back out to Jira in a loop. Best-effort: logs and swallows
   *  failures rather than throwing, so a Jira outage never blocks a task
   *  save for the user. */
  async pushTaskToJira(taskId: string): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        include: { workflowStage: true, priority: true, project: true },
      });
      if (!task) return;

      const integration = await this.getLinkedIntegration(task.projectId);
      if (!integration) return;

      const { jiraProjectKey, defaultIssueTypeName } = integration.config as unknown as JiraIntegrationConfig;
      const fields = {
        summary: task.title,
        description: toADF(task.description ?? ''),
        priority: { name: task.priority.name },
      };

      let issueKey = task.jiraIssueKey;
      if (!issueKey) {
        const created = await this.jira.createIssue(jiraProjectKey, defaultIssueTypeName, fields);
        issueKey = created.key;
      } else {
        await this.jira.updateIssue(issueKey, fields);
      }
      await this.jira.transitionIssue(issueKey, task.workflowStage.name);

      const issue = await this.jira.getIssue(issueKey);
      await this.prisma.task.update({
        where: { id: taskId },
        data: { jiraIssueKey: issueKey, jiraSyncedAt: new Date(issue.fields.updated) },
      });
    } catch (err) {
      const detail = axios.isAxiosError(err) ? JSON.stringify(err.response?.data) : (err as Error).message;
      this.logger.error(`Failed to push task ${taskId} to Jira: ${detail}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Incoming: Jira issue change -> SEBSA task (webhook + polling fallback share this)
  // ---------------------------------------------------------------------------

  async pullIssueIntoTask(issue: JiraIssue, projectId: string): Promise<void> {
    const updatedAt = new Date(issue.fields.updated);

    const existing = await this.prisma.task.findUnique({ where: { jiraIssueKey: issue.key } });

    // Loop guard: if we already recorded this exact (or a later) Jira
    // `updated` timestamp as synced, this event is an echo of our own
    // outgoing write (or a duplicate delivery) — skip it.
    if (existing?.jiraSyncedAt && existing.jiraSyncedAt >= updatedAt) return;

    const [workflowStage, priority] = await Promise.all([
      this.resolveOrCreateStage(projectId, issue.fields.status.name),
      issue.fields.priority ? this.resolveOrCreatePriority(projectId, issue.fields.priority.name) : null,
    ]);
    const syncActorId = await this.resolveSyncActorId();
    const description = fromADF(issue.fields.description);

    if (!existing) {
      const priorityId = priority?.id ?? (await this.resolveDefaultPriorityId(projectId));
      const task = await this.prisma.task.create({
        data: {
          projectId,
          title: issue.fields.summary,
          description,
          workflowStageId: workflowStage.id,
          priorityId,
          createdById: syncActorId,
          jiraIssueKey: issue.key,
          jiraSyncedAt: updatedAt,
          assignees: { create: [{ userId: syncActorId }] },
        },
      });
      await this.prisma.taskStatusHistory.create({
        data: { taskId: task.id, fromStageId: null, toStageId: workflowStage.id, changedById: syncActorId },
      });
      this.logger.log(`Created SEBSA task ${task.id} from Jira issue ${issue.key}.`);
      return;
    }

    const isStageChange = existing.workflowStageId !== workflowStage.id;
    await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        title: issue.fields.summary,
        description,
        workflowStageId: workflowStage.id,
        ...(priority && { priorityId: priority.id }),
        jiraSyncedAt: updatedAt,
      },
    });
    if (isStageChange) {
      await this.prisma.taskStatusHistory.create({
        data: {
          taskId: existing.id,
          fromStageId: existing.workflowStageId,
          toStageId: workflowStage.id,
          changedById: syncActorId,
        },
      });
    }
    this.logger.log(`Updated SEBSA task ${existing.id} from Jira issue ${issue.key}.`);
  }

  private async resolveOrCreateStage(projectId: string, name: string) {
    const existing = await this.prisma.workflowStage.findFirst({ where: { projectId, name } });
    if (existing) return existing;
    const maxOrder = await this.prisma.workflowStage.aggregate({ where: { projectId }, _max: { order: true } });
    return this.prisma.workflowStage.create({
      data: { projectId, name, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  private async resolveOrCreatePriority(projectId: string, name: string) {
    const existing = await this.prisma.projectPriority.findFirst({ where: { projectId, name } });
    if (existing) return existing;
    const maxOrder = await this.prisma.projectPriority.aggregate({ where: { projectId }, _max: { order: true } });
    return this.prisma.projectPriority.create({
      data: { projectId, name, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  private async resolveDefaultPriorityId(projectId: string): Promise<string> {
    const priority = await this.prisma.projectPriority.findFirst({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    if (!priority) throw new BadRequestException('Project has no priorities configured.');
    return priority.id;
  }

  /** The fixed SEBSA identity every Jira-originated change is attributed to
   *  (createdBy / assignee), per explicit instruction rather than trying to
   *  match Jira assignee emails to SEBSA users. */
  private async resolveSyncActorId(): Promise<string> {
    if (this.syncActorIdCache) return this.syncActorIdCache;
    const user = await this.prisma.user.findUnique({ where: { email: 'janukshan.sivakumar@sebsaworld.com' } });
    if (!user) {
      throw new BadRequestException(
        'Jira sync actor user (janukshan.sivakumar@sebsaworld.com) does not exist in this database.',
      );
    }
    this.syncActorIdCache = user.id;
    return user.id;
  }

  // ---------------------------------------------------------------------------
  // Webhook entry point
  // ---------------------------------------------------------------------------

  async handleWebhookIssue(issue: JiraIssue): Promise<void> {
    const projectKey = (issue as unknown as { fields: { project?: { key: string } } }).fields.project?.key;
    if (!projectKey) return;

    const integrations = await this.getAllActiveIntegrations();
    const match = integrations.find(
      (i) => (i.config as unknown as JiraIntegrationConfig).jiraProjectKey === projectKey,
    );
    if (!match) return;

    await this.pullIssueIntoTask(issue, match.projectId);
  }

  // ---------------------------------------------------------------------------
  // Polling fallback
  // ---------------------------------------------------------------------------

  async pollAllLinkedProjects(): Promise<void> {
    const integrations = await this.getAllActiveIntegrations();
    for (const integration of integrations) {
      const { jiraProjectKey } = integration.config as unknown as JiraIntegrationConfig;
      try {
        const issues = await this.jira.searchIssues(`project = "${jiraProjectKey}" AND updated >= "-10m"`);
        for (const issue of issues) {
          await this.pullIssueIntoTask(issue, integration.projectId);
        }
      } catch (err) {
        this.logger.error(`Polling failed for Jira project ${jiraProjectKey}: ${(err as Error).message}`);
      }
    }
  }
}
