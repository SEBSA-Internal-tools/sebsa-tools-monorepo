import { PrismaService } from '@sebsa-pm-tool/core';

export interface CloneMappingInput {
  priorityId: string;
  assigneeIds: string[];
  labelIds: string[];
}

export interface CloneMapping {
  /** undefined = no match in the target project; let create() use its default. */
  priorityId: string | undefined;
  assigneeIds: string[];
  labelIds: string[];
  /** Human-readable list of things that could not be carried over. */
  notes: string[];
}

/**
 * Translate project-scoped references (priority, assignees, labels) of an
 * item being copied into the target project. Same project: keep what is still
 * valid. Another project: priorities and labels are matched by name, and
 * assignees are kept only if they are members of the target project.
 */
export async function mapForTargetProject(
  prisma: PrismaService,
  sourceProjectId: string,
  targetProjectId: string,
  input: CloneMappingInput,
): Promise<CloneMapping> {
  const notes: string[] = [];
  const sameProject = sourceProjectId === targetProjectId;

  // Priority
  let priorityId: string | undefined = input.priorityId;
  if (!sameProject) {
    const sourcePriority = await prisma.projectPriority.findUnique({
      where: { id: input.priorityId },
      select: { name: true },
    });
    const match = sourcePriority
      ? await prisma.projectPriority.findUnique({
          where: { projectId_name: { projectId: targetProjectId, name: sourcePriority.name } },
          select: { id: true },
        })
      : null;
    priorityId = match?.id;
    if (!match) {
      notes.push(
        `Priority "${sourcePriority?.name ?? 'unknown'}" does not exist in the target project; the default priority was used.`,
      );
    }
  }

  // Assignees
  const assigneeIds = input.assigneeIds.length
    ? (
        await prisma.projectMember.findMany({
          where: {
            userId: { in: input.assigneeIds },
            projectId: targetProjectId,
            deletedAt: null,
            user: { isActive: true, deletedAt: null },
          },
          select: { userId: true },
        })
      ).map((m) => m.userId)
    : [];
  const droppedAssignees = input.assigneeIds.length - assigneeIds.length;
  if (droppedAssignees > 0) {
    notes.push(
      `${droppedAssignees} assignee${droppedAssignees === 1 ? '' : 's'} skipped (not an active member of the target project).`,
    );
  }

  // Labels
  let labelIds: string[] = [];
  if (input.labelIds.length) {
    if (sameProject) {
      labelIds = (
        await prisma.label.findMany({
          where: { id: { in: input.labelIds }, projectId: targetProjectId, deletedAt: null },
          select: { id: true },
        })
      ).map((l) => l.id);
    } else {
      const sourceLabels = await prisma.label.findMany({
        where: { id: { in: input.labelIds }, deletedAt: null },
        select: { name: true },
      });
      const targetLabels = await prisma.label.findMany({
        where: {
          projectId: targetProjectId,
          deletedAt: null,
          name: { in: sourceLabels.map((l) => l.name) },
        },
        select: { id: true },
      });
      labelIds = targetLabels.map((l) => l.id);
    }
    const droppedLabels = input.labelIds.length - labelIds.length;
    if (droppedLabels > 0) {
      notes.push(
        `${droppedLabels} label${droppedLabels === 1 ? '' : 's'} skipped (no label with the same name in the target project).`,
      );
    }
  }

  return { priorityId, assigneeIds, labelIds, notes };
}
