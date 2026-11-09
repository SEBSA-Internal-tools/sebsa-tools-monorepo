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

    // 1. Consolidated Single Query: Fetch all projects with members, cases, tasks, and active sprints
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(isPrivileged
          ? {}
          : {
              OR: [
                { members: { some: { userId: user.id, deletedAt: null } } },
                {
                  cases: {
                    some: {
                      deletedAt: null,
                      tasks: {
                        some: {
                          deletedAt: null,
                          assignees: { some: { userId: user.id } },
                        },
                      },
                    },
                  },
                },
              ],
            }),
      },
      include: {
        members: {
          where: { deletedAt: null },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        sprints: {
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            endDate: { gte: now },
          },
          orderBy: { endDate: 'asc' },
          take: 1,
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

    // 2. Aggregate metrics and candidate tasks in-memory in a single pass
    let totalOpenTasks = 0;
    let totalCompletedTasks = 0;
    let totalOverdueTasks = 0;
    let totalBlockedTasks = 0;
    let userAssignedOpenTasks = 0;
    const distinctActiveUserIds = new Set<string>();

    const allCandidateTasks: Array<{
      task: (typeof projects)[0]['cases'][0]['tasks'][0];
      projectName: string;
      projectId: string;
    }> = [];

    const activeSprints: Array<(typeof projects)[0]['sprints'][0]> = [];

    const projectHealthMatrix: DashboardProjectHealthItem[] = projects.map((project) => {
      project.members.forEach((m) => distinctActiveUserIds.add(m.user.id));
      if (project.sprints && project.sprints.length > 0) {
        activeSprints.push(...project.sprints);
      }

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

          allCandidateTasks.push({
            task,
            projectName: project.name,
            projectId: project.id,
          });
        }
      });

      totalCompletedTasks += projCompleted;

      const completionPercentage =
        totalTasks > 0
          ? Math.round((projCompleted / totalTasks) * 100)
          : project.status === 'COMPLETED'
          ? 100
          : 0;

      // Real timeline percentage
      let timeline = 0;
      if (project.startDate && project.targetEndDate) {
        const start = new Date(project.startDate).getTime();
        const end = new Date(project.targetEndDate).getTime();
        const cur = now.getTime();
        if (end > start) {
          timeline = Math.min(100, Math.max(0, Math.round(((cur - start) / (end - start)) * 100)));
        }
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

    // 3. Hero Section In-Memory Calculation
    const hour = now.getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = user.name ? user.name.split(' ')[0] : 'there';

    // Sort active sprints to get earliest release
    activeSprints.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    const nextSprint = activeSprints[0];

    // Find next upcoming due task in-memory
    const upcomingTasks = allCandidateTasks.filter(
      (c) => c.task.dueDate && new Date(c.task.dueDate) >= now
    );
    upcomingTasks.sort(
      (a, b) => new Date(a.task.dueDate!).getTime() - new Date(b.task.dueDate!).getTime()
    );
    const nextDueTask = upcomingTasks[0];

    let deadlineValue = '0';
    let deadlineLabel = 'days to next release';

    if (nextSprint && nextSprint.endDate) {
      const days = Math.max(
        0,
        Math.ceil((new Date(nextSprint.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
      deadlineValue = `${days}`;
      deadlineLabel = `${nextSprint.name || 'Active Sprint'} ends`;
    } else if (nextDueTask && nextDueTask.task.dueDate) {
      const days = Math.max(
        0,
        Math.ceil(
          (new Date(nextDueTask.task.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      deadlineValue = `${days}`;
      deadlineLabel = days === 0 ? 'Next task due today' : `Next task due in ${days}d`;
    } else {
      deadlineValue = `${activeProjects}`;
      deadlineLabel = 'Active Projects On Track';
    }

    const hero: DashboardHeroData = {
      greeting: `${timeGreeting}, ${firstName}`,
      title: 'Keep delivery, team load, and blockers in one view',
      description:
        'Real-time metrics aggregated across your assigned projects, active cases, and open deliverables.',
      stats: [
        {
          icon: 'schedule',
          value: deadlineValue,
          label: deadlineLabel,
        },
        {
          icon: 'group',
          value: `${distinctActiveUserIds.size}`,
          label: 'Active Team Members',
        },
      ],
    };

    // 4. Summary Cards Data
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

    // 5. Actionable Urgent Tasks Prioritization
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
