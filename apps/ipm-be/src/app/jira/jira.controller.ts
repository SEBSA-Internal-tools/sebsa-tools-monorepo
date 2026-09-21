import {
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  NotFoundException,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JiraSyncService } from './jira-sync.service';
import { LinkJiraProjectDto } from './dto/link-jira-project.dto';
import { LinkJiraIssueDto } from './dto/link-jira-issue.dto';

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

  @Get('projects/:id/jira/link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'The Jira project this project is linked to, or null.' })
  async getProjectLink(
    @Param('id', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertCanConfigureIntegrations(projectId, user);
    return this.jiraSync.getProjectLink(projectId);
  }

  @Delete('projects/:id/jira/link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stop syncing this project. Cases keep what they last pulled.' })
  async unlinkProject(
    @Param('id', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertCanConfigureIntegrations(projectId, user);
    await this.jiraSync.unlinkProject(projectId);
    return { message: 'Unlinked from Jira.' };
  }

  @Post('cases/:id/jira/link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Attach a Jira issue to a case and pull its current state.' })
  async linkCase(
    @Param('id', ParseUUIDPipe) caseId: string,
    @Body() dto: LinkJiraIssueDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertCanConfigureIntegrations(await this.projectIdForCase(caseId), user);
    await this.jiraSync.linkCase(caseId, dto.issueKey);
    return { message: `Linked to Jira issue ${dto.issueKey}.` };
  }

  @Delete('cases/:id/jira/link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Detach the Jira issue and clear the fields it supplied.' })
  async unlinkCase(
    @Param('id', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertCanConfigureIntegrations(await this.projectIdForCase(caseId), user);
    await this.jiraSync.unlinkCase(caseId);
    return { message: 'Unlinked from Jira.' };
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

  private async projectIdForCase(caseId: string): Promise<string> {
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, deletedAt: null },
      select: { projectId: true },
    });
    if (!kase) throw new NotFoundException('Case not found.');
    return kase.projectId;
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
