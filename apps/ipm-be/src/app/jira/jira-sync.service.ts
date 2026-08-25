import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { Prisma, TaskStatus } from '@prisma/client';
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

/** Human-readable label for each fixed TaskStatus value, used only to talk
 * to Jira (transitionIssue matches by display name). Best-effort: assumes
 * the linked Jira project has similarly-named statuses — this project's
 * TaskStatus is a fixed, global enum, not something that can be configured
 * to match a specific Jira workflow per project. */
const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TO_DO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

/** Reverse direction: best-effort keyword match from a Jira status's display
 * name back to our fixed TaskStatus vocabulary — same heuristic used by the
 * Case-hierarchy migration to translate the old free-form WorkflowStage
 * names (see prisma/migrations/20260825120000_introduce_case_hierarchy). */
function deriveTaskStatusFromJiraStatusName(name: string): TaskStatus {
  const n = name.toLowerCase();
  if (n.includes('progress') || n.includes('ongoing')) return 'IN_PROGRESS';
  if (n.includes('review') || n.includes('test') || n.includes('verif')) return 'IN_REVIEW';
  if (n.includes('block')) return 'BLOCKED';
  if (n.includes('done') || n.includes('complet') || n.includes('closed') || n.includes('merged')) return 'DONE';
  if (n.includes('cancel')) return 'CANCELLED';
  return 'TO_DO';
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
   *  priorities as matching project priorities. Statuses are no longer
   *  mirrored: Task.status became a fixed, global enum (see TaskStatus) when
   *  the Case hierarchy replaced the old per-project WorkflowStage model, so
   *  there's nothing project-specific left to create here — outgoing/
   *  incoming status sync instead best-effort-maps to/from that fixed list
   *  (see TASK_STATUS_LABELS / deriveTaskStatusFromJiraStatusName above).
   *  Safe to re-run: skips priorities already present by name. */
  async linkProject(projectId: string, jiraProjectKey: string): Promise<void> {
    if (!this.jira.isConfigured()) {
      throw new BadRequestException('Jira integration is not configured on this server.');
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found.');

    const [jiraPriorities, issueTypes, existingPriorities] = await Promise.all([
      this.jira.getPriorities(),
      this.jira.getProjectIssueTypes(jiraProjectKey),
      this.prisma.projectPriority.findMany({ where: { projectId } }),
    ]);
    if (issueTypes.length === 0) {
      throw new BadRequestException(`Jira project ${jiraProjectKey} has no usable (non-subtask) issue types.`);
    }
    const defaultIssueTypeName = issueTypes[0].name;

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

  /** Every incoming Jira issue needs some Case to attach its Task to. There's
   *  no signal in a bare Jira issue for which Epic/Story it should belong
   *  under, so — mirroring the migration's placeholder-Case pattern — this
   *  finds-or-creates one GENERAL Case per project to hold Jira-synced tasks
   *  that don't otherwise map to a specific Case. */
  private async resolveJiraSyncCaseId(projectId: string, priorityId: string, createdById: string): Promise<string> {
    const existing = await this.prisma.case.findFirst({
      where: { projectId, type: 'GENERAL', title: 'Jira Sync' },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.case.create({
      data: {
        projectId,
        title: 'Jira Sync',
        description: 'Auto-created to hold tasks synced in from Jira.',
        type: 'GENERAL',
        priorityId,
        createdById,
      },
    });
    return created.id;
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
        include: { priority: true, case: { select: { projectId: true } } },
      });
      if (!task) return;

      const integration = await this.getLinkedIntegration(task.case.projectId);
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
      await this.jira.transitionIssue(issueKey, TASK_STATUS_LABELS[task.status]);

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

    const status = deriveTaskStatusFromJiraStatusName(issue.fields.status.name);
    const priority = issue.fields.priority
      ? await this.resolveOrCreatePriority(projectId, issue.fields.priority.name)
      : null;
    const syncActorId = await this.resolveSyncActorId();
    const description = fromADF(issue.fields.description);

    if (!existing) {
      const priorityId = priority?.id ?? (await this.resolveDefaultPriorityId(projectId));
      const caseId = await this.resolveJiraSyncCaseId(projectId, priorityId, syncActorId);
      const task = await this.prisma.task.create({
        data: {
          caseId,
          title: issue.fields.summary,
          description,
          status,
          priorityId,
          createdById: syncActorId,
          jiraIssueKey: issue.key,
          jiraSyncedAt: updatedAt,
          assignees: { create: [{ userId: syncActorId }] },
        },
      });
      await this.prisma.taskStatusHistory.create({
        data: { taskId: task.id, fromStatus: null, toStatus: status, changedById: syncActorId },
      });
      this.logger.log(`Created SEBSA task ${task.id} from Jira issue ${issue.key}.`);
      return;
    }

    const isStatusChange = existing.status !== status;
    await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        title: issue.fields.summary,
        description,
        status,
        ...(priority && { priorityId: priority.id }),
        jiraSyncedAt: updatedAt,
      },
    });
    if (isStatusChange) {
      await this.prisma.taskStatusHistory.create({
        data: {
          taskId: existing.id,
          fromStatus: existing.status,
          toStatus: status,
          changedById: syncActorId,
        },
      });
    }
    this.logger.log(`Updated SEBSA task ${existing.id} from Jira issue ${issue.key}.`);
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
