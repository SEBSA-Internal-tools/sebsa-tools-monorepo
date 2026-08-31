import { Body, Controller, ForbiddenException, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JiraSyncService } from './jira-sync.service';
import { LinkJiraProjectDto } from './dto/link-jira-project.dto';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

@ApiTags('jira')
@Controller()
export class JiraController {
  constructor(
    private readonly jiraSync: JiraSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('projects/:id/jira/link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async link(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: LinkJiraProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertCanConfigureIntegrations(projectId, user);
    await this.jiraSync.linkProject(projectId, dto.jiraProjectKey);
    return { message: `Linked to Jira project ${dto.jiraProjectKey}.` };
  }

  /** Jira Automation "Send web request" rules (or a classic site webhook)
   *  POST here on issue create/update. No auth guard — Jira can't send our
   *  JWT — scoped instead by matching the payload's project key against a
   *  known, enabled Integration row in handleWebhookIssue. */
  @Post('jira/webhook')
  @HttpCode(200)
  async webhook(@Body() body: { webhookEvent?: string; issue?: unknown }) {
    if (!body.webhookEvent?.startsWith('jira:issue_') || !body.issue) {
      return { received: true, processed: false };
    }
    await this.jiraSync.handleWebhookIssue(body.issue as Parameters<JiraSyncService['handleWebhookIssue']>[0]);
    return { received: true, processed: true };
  }

  private async assertCanConfigureIntegrations(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;
    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });
    if (!membership || !membership.role.privilegeGroup.canConfigureIntegrations) {
      throw new ForbiddenException('You do not have permission to configure integrations for this project.');
    }
  }
}
