import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import {
  AuthUser,
  DashboardHeroData,
  DashboardProjectHealthItem,
  DashboardSummaryCard,
  DashboardSummaryResponse,
  DashboardUrgentTask,
} from '@sebsa-pm-tool/shared-models';

const PRIVILEGED_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN', 'EXECUTIVE'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: AuthUser): Promise<DashboardSummaryResponse> {
    const isPrivileged = PRIVILEGED_ROLES.includes(user.systemRole);
    const now = new Date();

    // 1. Query all projects visible to this user with members and cases -> tasks
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(isPrivileged ? {} : { members: { some: { userId: user.id, deletedAt: null } } }),
      },
      include: {
        members: {
          where: { deletedAt: null },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        cases: {
          where: { deletedAt: null },
          include: {
            tasks: {
              where: { deletedAt: null },
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
                caseId: true,
                assignees: { select: { userId: true } },
                incomingLinks: { where: { type: 'BLOCKS' }, select: { id: true } },
                priority: { select: { name: true, color: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const projectIds = projects.map((p) => p.id);

    // 2. Next upcoming sprint or task deadline
    const [nextSprint, nextDueTask] = await Promise.all([
      projectIds.length > 0
        ? this.prisma.sprint.findFirst({
            where: {
              projectId: { in: projectIds },
              status: 'ACTIVE',
              endDate: { gte: now },
            },
            orderBy: { endDate: 'asc' },
          })
        : null,
      projectIds.length > 0
        ? this.prisma.task.findFirst({
            where: {
              case: { projectId: { in: projectIds } },
              deletedAt: null,
              status: { notIn: ['DONE', 'CANCELLED'] },
              dueDate: { gte: now },
              ...(isPrivileged ? {} : { assignees: { some: { userId: user.id } } }),
            },
            orderBy: { dueDate: 'asc' },
          })
        : null,
    ]);

    // 3. Process each project into real health metrics
    let totalOpenTasks = 0;
    let totalCompletedTasks = 0;
    let totalOverdueTasks = 0;
    let totalBlockedTasks = 0;
    let userAssignedOpenTasks = 0;
    const distinctActiveUserIds = new Set<string>();

    const projectHealthMatrix: DashboardProjectHealthItem[] = projects.map((project) => {
      // Collect distinct members
      project.members.forEach((m) => distinctActiveUserIds.add(m.user.id));

      const projectTasks = project.cases.flatMap((c) => c.tasks);
      const totalTasks = projectTasks.length;
      let projCompleted = 0;
      let projOverdue = 0;
      let projBlocked = 0;

      projectTasks.forEach((task) => {
        const isDone = task.status === 'DONE';
        const isCancelled = task.status === 'CANCELLED';
        const isUserAssigned = task.assignees.some((a) => a.userId === user.id);

        if (isDone) {
          projCompleted++;
        } else if (!isCancelled) {
          totalOpenTasks++;
          if (isUserAssigned) {
            userAssignedOpenTasks++;
          }
          if (task.dueDate && new Date(task.dueDate) < now) {
            projOverdue++;
            totalOverdueTasks++;
          }
          if (task.status === 'BLOCKED' || (task.incomingLinks && task.incomingLinks.length > 0)) {
            projBlocked++;
            totalBlockedTasks++;
          }
        }
      });

      totalCompletedTasks += projCompleted;

      const completionPercentage =
        totalTasks > 0
          ? Math.round((projCompleted / totalTasks) * 100)
          : project.status === 'COMPLETED'
          ? 100
          : 0;

      // Timeline percentage
      let timeline = 0;
      if (project.startDate && project.targetEndDate) {
        const start = new Date(project.startDate).getTime();
        const end = new Date(project.targetEndDate).getTime();
        const cur = now.getTime();
        if (end > start) {
          timeline = Math.min(100, Math.max(0, Math.round(((cur - start) / (end - start)) * 100)));
        }
      } else {
        timeline = completionPercentage;
      }

      const risks = projOverdue + projBlocked;

      // Determine health status
      let healthStatus: 'success' | 'warning' | 'danger' = 'success';
      let health = 'On Track';

      if (project.status === 'COMPLETED') {
        healthStatus = 'success';
        health = 'Completed';
      } else if (project.status === 'ON_HOLD') {
        healthStatus = 'warning';
        health = 'On Hold';
      } else if (risks >= 3 || (timeline >= 80 && completionPercentage < 50)) {
        healthStatus = 'danger';
        health = 'Critical';
      } else if (risks >= 1 || (timeline >= 50 && completionPercentage < 30)) {
        healthStatus = 'warning';
        health = 'At Risk';
      } else {
        healthStatus = 'success';
        health = 'On Track';
      }

      return {
        id: project.id,
        projectName: project.name,
        status: project.status,
        health,
        healthStatus,
        budget: completionPercentage,
        timeline,
        resources: project.members.length,
        risks,
        completionPercentage,
        team: project.members.map((m) => m.user.name),
        totalTasks,
        completedTasks: projCompleted,
        color: project.color,
      };
    });

    const totalProjects = projects.length;
    const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
    const allTasksCount = totalOpenTasks + totalCompletedTasks;
    const overallDeliveryRate =
      allTasksCount > 0 ? Math.round((totalCompletedTasks / allTasksCount) * 100) : 0;

    // 4. Hero Section Data
    const hour = now.getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = user.name ? user.name.split(' ')[0] : 'there';

    let deadlineValue = '0';
    let deadlineLabel = 'days to next release';

    if (nextSprint && nextSprint.endDate) {
      const days = Math.max(
        0,
        Math.ceil((new Date(nextSprint.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
      deadlineValue = `${days}`;
      deadlineLabel = `days to ${nextSprint.name} end`;
    } else if (nextDueTask && nextDueTask.dueDate) {
      const days = Math.max(
        0,
        Math.ceil((new Date(nextDueTask.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
      deadlineValue = `${days}`;
      deadlineLabel = 'days to next task due';
    } else {
      deadlineValue = `${activeProjects}`;
      deadlineLabel = `active project${activeProjects === 1 ? '' : 's'}`;
    }

    const hero: DashboardHeroData = {
      greeting: `${timeGreeting}, ${firstName}!`,
      title: 'Keep delivery, team load, and blockers in one view',
      description:
        userAssignedOpenTasks > 0
          ? `You have ${userAssignedOpenTasks} task${userAssignedOpenTasks === 1 ? '' : 's'} assigned to you across ${activeProjects} active project${activeProjects === 1 ? '' : 's'}.`
          : `Monitor real-time delivery health, deadlines, and project risks across ${activeProjects} active project${activeProjects === 1 ? '' : 's'}.`,
      stats: [
        {
          icon: 'schedule',
          value: deadlineValue,
          label: deadlineLabel,
        },
        {
          icon: 'group',
          value: `${distinctActiveUserIds.size || 1}`,
          label: 'team members active',
        },
      ],
    };

    // 5. Summary Cards
    const totalRisks = totalOverdueTasks + totalBlockedTasks;

    const summaryCards: DashboardSummaryCard[] = [
      {
        label: 'Active Projects',
        value: `${activeProjects}`,
        change: `${totalProjects} total project${totalProjects === 1 ? '' : 's'}`,
        icon: 'folder_open',
        tone: 'primary',
      },
      {
        label: 'Open Tasks',
        value: `${totalOpenTasks}`,
        change: isPrivileged
          ? `${totalCompletedTasks} tasks closed`
          : `${userAssignedOpenTasks} assigned to you`,
        icon: 'task_alt',
        tone: 'success',
      },
      {
        label: 'Blocked & At Risk',
        value: `${totalRisks}`,
        change:
          totalRisks > 0
            ? `${totalOverdueTasks} overdue, ${totalBlockedTasks} blocked`
            : 'No active blockers',
        icon: 'warning',
        tone: totalRisks > 0 ? 'warning' : 'success',
      },
      {
        label: 'Delivery Health',
        value: `${overallDeliveryRate}%`,
        change: `${totalCompletedTasks} of ${allTasksCount} tasks closed`,
        icon: 'monitor_heart',
        tone: overallDeliveryRate >= 70 ? 'success' : overallDeliveryRate >= 40 ? 'warning' : 'primary',
      },
    ];

    // 6. Actionable Urgent Tasks
    const allCandidateTasks: Array<{
      task: (typeof projects)[0]['cases'][0]['tasks'][0];
      projectName: string;
      projectId: string;
    }> = [];

    projects.forEach((proj) => {
      proj.cases.forEach((c) => {
        c.tasks.forEach((t) => {
          if (t.status !== 'DONE' && t.status !== 'CANCELLED') {
            allCandidateTasks.push({
              task: t,
              projectName: proj.name,
              projectId: proj.id,
            });
          }
        });
      });
    });

    allCandidateTasks.sort((a, b) => {
      // Prioritize tasks assigned to current user
      const aIsAssigned = a.task.assignees.some((u) => u.userId === user.id) ? 1 : 0;
      const bIsAssigned = b.task.assignees.some((u) => u.userId === user.id) ? 1 : 0;
      if (aIsAssigned !== bIsAssigned) return bIsAssigned - aIsAssigned;

      // Overdue tasks
      const aOverdue = a.task.dueDate && new Date(a.task.dueDate) < now ? 1 : 0;
      const bOverdue = b.task.dueDate && new Date(b.task.dueDate) < now ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;

      // Blocked tasks
      const aBlocked =
        a.task.status === 'BLOCKED' || (a.task.incomingLinks && a.task.incomingLinks.length > 0)
          ? 1
          : 0;
      const bBlocked =
        b.task.status === 'BLOCKED' || (b.task.incomingLinks && b.task.incomingLinks.length > 0)
          ? 1
          : 0;
      if (aBlocked !== bBlocked) return bBlocked - aBlocked;

      // Earliest due date
      if (a.task.dueDate && b.task.dueDate) {
        return new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime();
      }
      return a.task.dueDate ? -1 : 1;
    });

    const urgentTasks: DashboardUrgentTask[] = allCandidateTasks
      .slice(0, 5)
      .map(({ task, projectName, projectId }) => ({
        id: task.id,
        title: task.title,
        projectName,
        projectId,
        caseId: task.caseId,
        status: task.status,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        isOverdue: Boolean(task.dueDate && new Date(task.dueDate) < now),
        isBlocked: Boolean(
          task.status === 'BLOCKED' || (task.incomingLinks && task.incomingLinks.length > 0)
        ),
        priorityName: task.priority?.name,
        priorityColor: task.priority?.color,
      }));

    return {
      hero,
      summaryCards,
      projectHealthMatrix,
      urgentTasks,
    };
  }
}
